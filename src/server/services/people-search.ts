/**
 * Personensuche für die Schnell-Anmeldung: bekannte Personen (auch aus früheren Events) zum Übernehmen.
 * Eingeschränkte oder anonymisierte Personen (DSGVO) werden nie vorgeschlagen.
 */
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { events, people, registrations } from '@/server/db/schema';

export type PersonHit = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  locale: 'de' | 'en';
  /** Namen der letzten Events dieser Person (neueste zuerst, höchstens 2) */
  events: (typeof events.$inferSelect)['name'][];
  /** schon für das gewählte Event angemeldet (nicht storniert) */
  registeredHere: boolean;
};

const LIMIT = 6;

function like(expr: SQL, q: string): SQL {
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`lower(${expr}) LIKE ${pattern} ESCAPE '\\'`;
}

export function searchPeople(db: Db, query: string, eventId: number): PersonHit[] {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const found = db
    .select()
    .from(people)
    .where(
      and(
        isNull(people.restrictedAt),
        isNull(people.anonymizedAt),
        or(
          like(sql`${people.firstName} || ' ' || ${people.lastName}`, q),
          like(sql`${people.lastName} || ' ' || ${people.firstName}`, q),
          like(sql`coalesce(${people.email}, '')`, q),
          like(sql`coalesce(${people.company}, '')`, q)
        )
      )
    )
    .orderBy(people.lastName, people.firstName)
    .limit(LIMIT)
    .all();
  if (found.length === 0) return [];
  const regs = db
    .select({ personId: registrations.personId, eventId: registrations.eventId, status: registrations.status, name: events.name, startsAt: events.startsAt })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(inArray(registrations.personId, found.map((p) => p.id)))
    .orderBy(desc(events.startsAt))
    .all();
  return found.map((p) => {
    const mine = regs.filter((r) => r.personId === p.id);
    return {
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      company: p.company,
      locale: p.locale,
      events: [...new Map(mine.map((r) => [r.eventId, r.name])).values()].slice(0, 2),
      registeredHere: mine.some((r) => r.eventId === eventId && r.status !== 'cancelled'),
    };
  });
}
