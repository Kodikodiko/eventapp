/**
 * Speaker und ihre Anmeldung (Geschäftsregel vom 19.11.2026):
 * - Wird ein Speaker angelegt, bekommt er die Rolle „speaker“. Hat die Person noch keine aktive Anmeldung zum Event,
 *   wird eine kostenlose Speaker-Anmeldung (nur Rolle „speaker“) angelegt. Sie belegt einen Platz (bestätigt).
 * - Teilnehmer wird ein Speaker nur durch Ticketkauf oder Zuteilung: Ein Ticketkauf bzw. eine Admin-Anmeldung
 *   storniert die reine Speaker-Anmeldung und legt die neue Anmeldung an, die wieder die Rolle „speaker“ bekommt.
 *   Zuteilen geht auch direkt, indem man der Speaker-Anmeldung die Rolle „Teilnehmer“ gibt.
 * - Wird der Speaker entfernt, wird eine reine Speaker-Anmeldung storniert; andere Anmeldungen behalten ihre Rollen.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { registrationRoles, registrations, roles, speakers } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';

export const SPEAKER_ROLE_KEY = 'speaker';

function speakerRoleId(tx: Tx): number | null {
  return tx.select({ id: roles.id }).from(roles).where(eq(roles.key, SPEAKER_ROLE_KEY)).get()?.id ?? null;
}

function addRole(tx: Tx, roleId: number, registrationIds: number[]): number[] {
  if (registrationIds.length === 0) return [];
  const has = new Set(
    tx
      .select({ id: registrationRoles.registrationId })
      .from(registrationRoles)
      .where(and(inArray(registrationRoles.registrationId, registrationIds), eq(registrationRoles.roleId, roleId)))
      .all()
      .map((r) => r.id)
  );
  const missing = registrationIds.filter((id) => !has.has(id));
  if (missing.length > 0) tx.insert(registrationRoles).values(missing.map((registrationId) => ({ registrationId, roleId }))).run();
  return missing;
}

function activeRegistration(tx: Tx, eventId: number, personId: number) {
  return tx
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.personId, personId), ne(registrations.status, 'cancelled')))
    .get();
}

function roleKeysOf(tx: Tx, registrationId: number): string[] {
  return tx
    .select({ key: roles.key })
    .from(registrationRoles)
    .innerJoin(roles, eq(roles.id, registrationRoles.roleId))
    .where(eq(registrationRoles.registrationId, registrationId))
    .all()
    .map((r) => r.key);
}

/** Reine Speaker-Anmeldung: kostenlos und nur mit der Rolle „speaker“. */
function isSpeakerOnly(tx: Tx, reg: typeof registrations.$inferSelect): boolean {
  if (reg.priceCents !== 0) return false;
  const keys = roleKeysOf(tx, reg.id);
  return keys.length === 1 && keys[0] === SPEAKER_ROLE_KEY;
}

/**
 * Beim Anlegen eines Speakers: vorhandene aktive Anmeldung bekommt die Rolle „speaker“,
 * sonst wird eine kostenlose Speaker-Anmeldung angelegt (bestätigt, belegt einen Platz, Überbuchung erlaubt).
 */
export function ensureSpeakerRegistration(tx: Tx, actor: Actor, eventId: number, personId: number): void {
  const roleId = speakerRoleId(tx);
  if (roleId === null) return;
  const active = activeRegistration(tx, eventId, personId);
  if (active) {
    if (addRole(tx, roleId, [active.id]).length > 0) {
      writeAudit(tx, actor, {
        action: 'registration.updated',
        entity: 'registration',
        entityId: active.id,
        eventId,
        summary: 'Rolle „speaker“ automatisch hinzugefügt (als Speaker angelegt)',
      });
    }
    return;
  }
  const now = new Date().toISOString();
  const [reg] = tx
    .insert(registrations)
    .values({
      eventId,
      personId,
      status: 'confirmed',
      paymentMethod: 'free',
      paymentStatus: 'not_required',
      ticketType: 'normal',
      priceCents: 0,
      source: 'admin',
      confirmedAt: now,
      qrToken: randomUUID(),
    })
    .returning({ id: registrations.id })
    .all();
  tx.insert(registrationRoles).values({ registrationId: reg.id, roleId }).run();
  writeAudit(tx, actor, {
    action: 'registration.created',
    entity: 'registration',
    entityId: reg.id,
    eventId,
    summary: 'Speaker-Anmeldung automatisch angelegt (Rolle „speaker“, kostenlos)',
  });
}

/** Storniert eine reine Speaker-Anmeldung der Person (z. B. weil ein Ticket gekauft wird). Liefert true, wenn storniert. */
export function releaseSpeakerOnlyRegistration(tx: Tx, actor: Actor, eventId: number, personId: number, reason: string): boolean {
  const active = activeRegistration(tx, eventId, personId);
  if (!active || !isSpeakerOnly(tx, active)) return false;
  tx.update(registrations)
    .set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason, reservedUntil: null })
    .where(eq(registrations.id, active.id))
    .run();
  writeAudit(tx, actor, {
    action: 'registration.cancelled',
    entity: 'registration',
    entityId: active.id,
    eventId,
    summary: `Speaker-Anmeldung storniert: ${reason}`,
  });
  return true;
}

/** Ergänzt die Speaker-Rolle an einer neuen Anmeldung, wenn die Person Speaker des Events ist. */
export function applySpeakerRoleToRegistration(tx: Tx, registrationId: number, eventId: number, personId: number): boolean {
  const isSpeaker = tx
    .select({ id: speakers.id })
    .from(speakers)
    .where(and(eq(speakers.eventId, eventId), eq(speakers.personId, personId)))
    .get();
  if (!isSpeaker) return false;
  const roleId = speakerRoleId(tx);
  if (roleId === null) return false;
  return addRole(tx, roleId, [registrationId]).length > 0;
}
