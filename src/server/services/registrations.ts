/**
 * Anmeldungen aus Sicht des Admin-Bereichs: auflisten, anlegen, bearbeiten, stornieren,
 * Warteliste bestätigen. (Öffentliche Anmeldung und Zahlung folgen in Phase 5/6.)
 *
 * Regeln:
 * - Eine Person (E-Mail) wird wiederverwendet; pro Event höchstens eine nicht stornierte Anmeldung.
 * - Bestätigte und nicht abgelaufene reservierte Anmeldungen zählen gegen die Kapazität;
 *   Admins dürfen bewusst überbuchen (overbook).
 * - Stornieren löscht nie, sondern setzt den Status (Erstattung folgt in Phase 8).
 * - Preis 0 → Zahlungsart „free“, Zahlung „not_required“; sonst Rechnung mit offener Zahlung.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { RegistrationStatusKey } from '@/lib/registrations-filter';
import type { RegistrationAdminInput } from '@/lib/validation/registrations';
import type { Db } from '@/server/db/core';
import { events, people, registrationRoles, registrations, roles } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';
import { getEventStats } from './events';
import { activeInvoiceNumbersByRegistration, activeInvoiceOf } from './invoices';
import { updatePerson, upsertPerson } from './people';

export type RegistrationListRow = {
  id: number;
  personId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  locale: 'de' | 'en';
  status: RegistrationStatusKey;
  paymentStatus: (typeof registrations.$inferSelect)['paymentStatus'];
  paymentMethod: (typeof registrations.$inferSelect)['paymentMethod'];
  ticketType: 'normal' | 'member';
  priceCents: number;
  roles: string[];
  source: (typeof registrations.$inferSelect)['source'];
  memberNumberEntered: string | null;
  billingCompany: string | null;
  billingAddress: string | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Nummer der gültigen (nicht stornierten) Rechnung */
  invoiceNumber: string | null;
};

export function listRegistrations(db: Db, eventId: number): RegistrationListRow[] {
  const rows = db
    .select({ r: registrations, p: people })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .where(eq(registrations.eventId, eventId))
    .all();
  const roleRows = db
    .select({ registrationId: registrationRoles.registrationId, key: roles.key })
    .from(registrationRoles)
    .innerJoin(roles, eq(roles.id, registrationRoles.roleId))
    .innerJoin(registrations, eq(registrations.id, registrationRoles.registrationId))
    .where(eq(registrations.eventId, eventId))
    .all();
  const invoiceNumbers = activeInvoiceNumbersByRegistration(db, eventId);
  const rolesByReg = new Map<number, string[]>();
  for (const rr of roleRows) rolesByReg.set(rr.registrationId, [...(rolesByReg.get(rr.registrationId) ?? []), rr.key]);

  return rows.map(({ r, p }) => ({
    id: r.id,
    personId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    company: p.company,
    locale: p.locale,
    status: r.status,
    paymentStatus: r.paymentStatus,
    paymentMethod: r.paymentMethod,
    ticketType: r.ticketType,
    priceCents: r.priceCents,
    roles: (rolesByReg.get(r.id) ?? []).sort(),
    source: r.source,
    memberNumberEntered: r.memberNumberEntered,
    billingCompany: r.billingCompany,
    billingAddress: r.billingAddress,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
    cancelledAt: r.cancelledAt,
    cancelReason: r.cancelReason,
    invoiceNumber: invoiceNumbers.get(r.id) ?? null,
  }));
}

export function listRoles(db: Db) {
  return db.select().from(roles).all();
}

function loadWritableEvent(tx: Tx, eventId: number) {
  const event = tx.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  return event;
}

function loadRegistration(tx: Tx, id: number) {
  const reg = tx.select().from(registrations).where(eq(registrations.id, id)).get();
  if (!reg) throw new ServiceError('NOT_FOUND');
  return { reg, event: loadWritableEvent(tx, reg.eventId) };
}

function resolveRoleIds(tx: Tx, keys: string[]): number[] {
  const rows = tx.select().from(roles).where(inArray(roles.key, keys)).all();
  if (rows.length !== keys.length || keys.length === 0) throw new ServiceError('INVALID', { roles: 'roleRequired' });
  return rows.map((r) => r.id);
}

function setRoles(tx: Tx, registrationId: number, roleIds: number[]) {
  tx.delete(registrationRoles).where(eq(registrationRoles.registrationId, registrationId)).run();
  tx.insert(registrationRoles).values(roleIds.map((roleId) => ({ registrationId, roleId }))).run();
}

function paymentFor(priceCents: number) {
  return priceCents === 0
    ? { paymentMethod: 'free' as const, paymentStatus: 'not_required' as const }
    : { paymentMethod: 'invoice' as const, paymentStatus: 'open' as const };
}

function assertSeatAvailable(tx: Tx, event: typeof events.$inferSelect, overbook: boolean) {
  if (overbook) return;
  if (getEventStats(tx, event).seatsFree <= 0) throw new ServiceError('CONFLICT', { status: 'eventFull' });
}

export function createRegistrationByAdmin(
  db: Db,
  actor: Actor,
  eventId: number,
  input: RegistrationAdminInput & { status: 'confirmed' | 'waitlisted'; overbook: boolean }
): number {
  return db.transaction(
    (tx) => {
      const event = loadWritableEvent(tx, eventId);
      const roleIds = resolveRoleIds(tx, input.roles);
      const personId = upsertPerson(tx, input);
      const active = tx
        .select({ id: registrations.id })
        .from(registrations)
        .where(and(eq(registrations.eventId, eventId), eq(registrations.personId, personId), ne(registrations.status, 'cancelled')))
        .get();
      if (active) throw new ServiceError('CONFLICT', { email: 'alreadyRegistered' });
      if (input.status === 'confirmed') assertSeatAvailable(tx, event, input.overbook);

      const now = new Date().toISOString();
      const [reg] = tx
        .insert(registrations)
        .values({
          eventId,
          personId,
          status: input.status,
          ...paymentFor(input.priceCents),
          ticketType: input.ticketType,
          priceCents: input.priceCents,
          billingCompany: input.billingCompany,
          billingAddress: input.billingAddress,
          source: 'admin',
          confirmedAt: input.status === 'confirmed' ? now : null,
          qrToken: randomUUID(),
        })
        .returning()
        .all();
      setRoles(tx, reg.id, roleIds);
      writeAudit(tx, actor, {
        action: 'registration.created',
        entity: 'registration',
        entityId: reg.id,
        eventId,
        summary: `Anmeldung durch Admin (${input.status}${input.overbook && input.status === 'confirmed' ? ', Überbuchung erlaubt' : ''})`,
      });
      return reg.id;
    },
    { behavior: 'immediate' }
  );
}

export function updateRegistrationByAdmin(db: Db, actor: Actor, id: number, input: RegistrationAdminInput): void {
  db.transaction((tx) => {
    const { reg } = loadRegistration(tx, id);
    const roleIds = resolveRoleIds(tx, input.roles);
    updatePerson(tx, reg.personId, input);

    const changed: string[] = [];
    const paymentLocked = reg.paymentStatus === 'paid' || reg.paymentStatus === 'partially_refunded' || reg.paymentStatus === 'refunded';
    if (input.priceCents !== reg.priceCents || input.ticketType !== reg.ticketType) {
      if (paymentLocked) throw new ServiceError('CONFLICT', { price: 'priceLocked' });
      if (activeInvoiceOf(tx, { registrationId: id })) throw new ServiceError('CONFLICT', { price: 'priceInvoiced' });
      changed.push('Preis/Tickettyp');
    }
    tx.update(registrations)
      .set({
        ticketType: input.ticketType,
        priceCents: input.priceCents,
        ...(paymentLocked || reg.paymentMethod === 'stripe' ? {} : paymentFor(input.priceCents)),
        billingCompany: input.billingCompany,
        billingAddress: input.billingAddress,
      })
      .where(eq(registrations.id, id))
      .run();
    setRoles(tx, id, roleIds);
    writeAudit(tx, actor, {
      action: 'registration.updated',
      entity: 'registration',
      entityId: id,
      eventId: reg.eventId,
      summary: ['Stammdaten/Rollen gespeichert', ...changed].join(', '),
    });
  });
}

/** Storniert und liefert die Event-ID (damit der frei gewordene Platz angeboten werden kann). */
export function cancelRegistrationByAdmin(db: Db, actor: Actor, id: number, reason: string): number {
  return db.transaction((tx) => {
    const { reg } = loadRegistration(tx, id);
    if (reg.status === 'cancelled') throw new ServiceError('CONFLICT');
    tx.update(registrations)
      .set({ status: 'cancelled', cancelledAt: new Date().toISOString(), cancelReason: reason, reservedUntil: null })
      .where(eq(registrations.id, id))
      .run();
    writeAudit(tx, actor, {
      action: 'registration.cancelled',
      entity: 'registration',
      entityId: id,
      eventId: reg.eventId,
      summary: `Storniert durch Admin (vorher ${reg.status})`,
    });
    return reg.eventId;
  });
}

export function confirmWaitlistedByAdmin(db: Db, actor: Actor, id: number, overbook: boolean): void {
  db.transaction(
    (tx) => {
      const { reg, event } = loadRegistration(tx, id);
      if (reg.status !== 'waitlisted') throw new ServiceError('CONFLICT');
      assertSeatAvailable(tx, event, overbook);
      tx.update(registrations).set({ status: 'confirmed', confirmedAt: new Date().toISOString() }).where(eq(registrations.id, id)).run();
      writeAudit(tx, actor, {
        action: 'registration.confirmed',
        entity: 'registration',
        entityId: id,
        eventId: reg.eventId,
        summary: `Von der Warteliste bestätigt${overbook ? ' (Überbuchung erlaubt)' : ''}`,
      });
    },
    { behavior: 'immediate' }
  );
}
