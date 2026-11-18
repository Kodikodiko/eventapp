/**
 * Check-in am Eventtag (TODO UI4): bestätigte Anmeldungen als anwesend markieren bzw. das rückgängig machen.
 * Nutzt das schon vorhandene Feld `registrations.checked_in_at`; jede Änderung kommt ins Protokoll.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { Db } from '@/server/db/core';
import { events, people, registrationRoles, registrations, roles } from '@/server/db/schema';
import { writeAudit, type Actor } from './audit';

export type CheckInRow = {
  id: number;
  firstName: string;
  lastName: string;
  company: string | null;
  roles: string[];
  paymentOpen: boolean;
  checkedInAt: string | null;
};

/** Alle bestätigten Anmeldungen eines Events (ohne eingeschränkte/anonymisierte Personen), nach Nachname. */
export function listCheckIn(db: Db, eventId: number): CheckInRow[] {
  const rows = db
    .select({ r: registrations, p: people })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, 'confirmed')))
    .all()
    .filter(({ p }) => !p.anonymizedAt);
  const ids = rows.map(({ r }) => r.id);
  const roleRows = ids.length
    ? db
        .select({ registrationId: registrationRoles.registrationId, key: roles.key })
        .from(registrationRoles)
        .innerJoin(roles, eq(roles.id, registrationRoles.roleId))
        .where(inArray(registrationRoles.registrationId, ids))
        .all()
    : [];
  return rows
    .map(({ r, p }) => ({
      id: r.id,
      firstName: p.firstName,
      lastName: p.lastName,
      company: p.company,
      roles: roleRows.filter((x) => x.registrationId === r.id).map((x) => x.key),
      paymentOpen: r.paymentStatus === 'open' && r.priceCents > 0,
      checkedInAt: r.checkedInAt,
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
}

/** Als anwesend markieren (`present = true`) oder zurücknehmen. Nur bestätigte Anmeldungen, nicht bei archivierten Events. */
export function setCheckedIn(db: Db, actor: Actor, registrationId: number, present: boolean, now = new Date()): string | null {
  const row = db
    .select({ r: registrations, e: events, p: people })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .innerJoin(people, eq(people.id, registrations.personId))
    .where(eq(registrations.id, registrationId))
    .get();
  if (!row) throw new ServiceError('NOT_FOUND');
  if (row.e.archivedAt) throw new ServiceError('ARCHIVED');
  if (row.r.status !== 'confirmed') throw new ServiceError('CONFLICT');
  const value = present ? (row.r.checkedInAt ?? now.toISOString()) : null;
  if (value === row.r.checkedInAt) return value;
  db.update(registrations).set({ checkedInAt: value }).where(eq(registrations.id, registrationId)).run();
  writeAudit(db, actor, {
    action: present ? 'registration.checked_in' : 'registration.check_in_undone',
    entity: 'registration',
    entityId: registrationId,
    eventId: row.e.id,
    summary: `${present ? 'Eingecheckt' : 'Check-in zurückgenommen'}: ${row.p.firstName} ${row.p.lastName}`,
  });
  return value;
}
