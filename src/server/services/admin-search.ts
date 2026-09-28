/**
 * Schnellsuche im Admin-Bereich (Strg+K): Personen mit Anmeldung, Rechnungen/Gutschriften und Events.
 * Liefert nur, was zum Springen nötig ist; Groß-/Kleinschreibung egal.
 */
import { desc, eq, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { events, invoices, people, registrations, sponsors } from '@/server/db/schema';

export type SearchHit =
  | { kind: 'registration'; id: number; eventId: number; eventName: (typeof events.$inferSelect)['name']; name: string; email: string | null; company: string | null; status: (typeof registrations.$inferSelect)['status'] }
  | { kind: 'invoice'; id: number; eventId: number; number: string; type: 'invoice' | 'credit_note'; recipient: string }
  | { kind: 'event'; id: number; name: (typeof events.$inferSelect)['name']; slug: string };

const LIMIT = 8;

function like(col: AnyColumn | SQL, q: string): SQL {
  const pattern = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`lower(${col}) LIKE ${pattern} ESCAPE '\\'`;
}

export function adminSearch(db: Db, query: string): SearchHit[] {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];

  const regs = db
    .select({ r: registrations, p: people, e: events })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(or(like(sql`${people.firstName} || ' ' || ${people.lastName}`, q), like(sql`${people.lastName} || ' ' || ${people.firstName}`, q), like(people.email, q), like(people.company, q)))
    .orderBy(desc(events.startsAt), people.lastName)
    .limit(LIMIT)
    .all()
    .map(({ r, p, e }): SearchHit => ({
      kind: 'registration',
      id: r.id,
      eventId: e.id,
      eventName: e.name,
      name: `${p.firstName} ${p.lastName}`.trim(),
      email: p.email,
      company: p.company,
      status: r.status,
    }));

  const invs = db
    .select({ i: invoices, regEvent: registrations.eventId, spEvent: sponsors.eventId })
    .from(invoices)
    .leftJoin(registrations, eq(registrations.id, invoices.registrationId))
    .leftJoin(sponsors, eq(sponsors.id, invoices.sponsorId))
    .where(or(like(invoices.number, q), like(sql`json_extract(${invoices.recipient}, '$.name')`, q), like(sql`json_extract(${invoices.recipient}, '$.company')`, q)))
    .orderBy(desc(invoices.number))
    .limit(5)
    .all()
    .map(({ i, regEvent, spEvent }): SearchHit => ({
      kind: 'invoice',
      id: i.id,
      eventId: (regEvent ?? spEvent)!,
      number: i.number,
      type: i.type,
      recipient: [i.recipient.company, i.recipient.name].filter(Boolean).join(' · '),
    }));

  const evs = db
    .select({ id: events.id, name: events.name, slug: events.slug })
    .from(events)
    .where(or(like(sql`json_extract(${events.name}, '$.de')`, q), like(sql`json_extract(${events.name}, '$.en')`, q), like(events.slug, q)))
    .orderBy(desc(events.startsAt))
    .limit(4)
    .all()
    .map((e): SearchHit => ({ kind: 'event', ...e }));

  return [...regs, ...invs, ...evs];
}
