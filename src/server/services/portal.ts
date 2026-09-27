/**
 * Teilnehmerportal (Spezifikation 3.2): Anmeldung per Link, eigene Daten, Belege, Stornierung.
 *
 * Sicherheit:
 * - Ein Portal-Konto (auth_users, Rolle „attendee“) entsteht nur für E-Mails, zu denen eine Person mit mindestens
 *   einer Anmeldung existiert; eingeschränkte/anonymisierte Personen erhalten keinen Link (DSGVO 7.4).
 * - Admin-Konten melden sich nie per Link an (das würde die Zwei-Faktor-Anmeldung umgehen).
 * - Jede Abfrage und Aktion ist auf die eigene Person (auth_users.person_id) beschränkt.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { Db } from '@/server/db/core';
import { authUsers, events, invoices, people, registrations } from '@/server/db/schema';
import { writeAudit, type Actor } from './audit';
import { creditedCents } from './invoices';
import { quoteCancellation, type CancellationQuote } from './refunds';

export type PortalAccount = { userId: string; personId: number; email: string; locale: 'de' | 'en' };

/** Person zur E-Mail, die das Portal nutzen darf (hat Anmeldungen, nicht eingeschränkt). */
function portalPerson(db: Db, email: string) {
  const person = db.select().from(people).where(eq(people.email, email.trim().toLowerCase())).get();
  if (!person || person.restrictedAt || person.anonymizedAt) return undefined;
  const regs = db.select({ n: count() }).from(registrations).where(eq(registrations.personId, person.id)).get()?.n ?? 0;
  return regs > 0 ? person : undefined;
}

/**
 * Portal-Konto zur E-Mail sicherstellen (anlegen bzw. mit der Person verknüpfen).
 * null, wenn kein Link gesendet werden darf (unbekannt, eingeschränkt, Admin-Konto).
 */
export function ensurePortalAccount(db: Db, email: string): PortalAccount | null {
  const person = portalPerson(db, email);
  if (!person || !person.email) return null;
  const existing = db.select().from(authUsers).where(eq(authUsers.email, person.email)).get();
  if (existing) {
    if (existing.role !== 'attendee') return null;
    if (existing.personId !== person.id) db.update(authUsers).set({ personId: person.id, updatedAt: new Date() }).where(eq(authUsers.id, existing.id)).run();
    return { userId: existing.id, personId: person.id, email: person.email, locale: person.locale };
  }
  const id = randomUUID();
  db.insert(authUsers)
    .values({ id, name: `${person.firstName} ${person.lastName}`.trim(), email: person.email, emailVerified: false, role: 'attendee', personId: person.id })
    .run();
  return { userId: id, personId: person.id, email: person.email, locale: person.locale };
}

/** Beim Versand (Callback des Link-Plugins) nochmals prüfen: nur Teilnehmer-Konten mit gültiger Person. */
export function portalLinkRecipient(db: Db, email: string): PortalAccount | null {
  const user = db.select().from(authUsers).where(eq(authUsers.email, email.trim().toLowerCase())).get();
  if (!user || user.role !== 'attendee' || !user.personId) return null;
  const person = portalPerson(db, email);
  if (!person || person.id !== user.personId || !person.email) return null;
  return { userId: user.id, personId: person.id, email: person.email, locale: person.locale };
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------

export type PortalDocument = { id: number; type: 'invoice' | 'credit_note'; number: string; issuedAt: string; grossCents: number; cancelled: boolean };

export type PortalRegistration = {
  id: number;
  eventName: (typeof events.$inferSelect)['name'];
  eventSlug: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: (typeof registrations.$inferSelect)['status'];
  paymentStatus: (typeof registrations.$inferSelect)['paymentStatus'];
  paymentMethod: (typeof registrations.$inferSelect)['paymentMethod'];
  ticketType: 'normal' | 'member';
  priceCents: number;
  createdAt: string;
  cancelledAt: string | null;
  canCancel: boolean;
  documents: PortalDocument[];
};

export type PortalPerson = { firstName: string; lastName: string; email: string; company: string | null; phone: string | null; locale: 'de' | 'en' };

/** Stornieren im Portal: bestätigt oder auf der Warteliste, Event nicht archiviert und noch nicht begonnen. */
export function portalCanCancel(reg: { status: string }, event: { startsAt: string; archivedAt: string | null }, now = new Date()): boolean {
  return (reg.status === 'confirmed' || reg.status === 'waitlisted') && !event.archivedAt && event.startsAt > now.toISOString();
}

export function portalOverview(db: Db, personId: number, now = new Date()): { person: PortalPerson; registrations: PortalRegistration[] } {
  const person = db.select().from(people).where(eq(people.id, personId)).get();
  if (!person || !person.email || person.restrictedAt || person.anonymizedAt) throw new ServiceError('FORBIDDEN');
  const rows = db
    .select({ reg: registrations, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.personId, personId))
    .orderBy(desc(events.startsAt))
    .all();
  // reservierte (Zahlung offen/abgebrochen) und stornierte Reservierungen ohne Bedeutung ausblenden
  const visible = rows.filter(({ reg }) => reg.status !== 'reserved' && !(reg.status === 'cancelled' && reg.confirmedAt == null && reg.paymentStatus === 'open' && reg.paymentMethod === 'stripe'));
  const ids = visible.map((r) => r.reg.id);
  const docs = ids.length ? db.select().from(invoices).where(inArray(invoices.registrationId, ids)).orderBy(asc(invoices.id)).all() : [];
  return {
    person: { firstName: person.firstName, lastName: person.lastName, email: person.email, company: person.company, phone: person.phone, locale: person.locale },
    registrations: visible.map(({ reg, event }) => ({
      id: reg.id,
      eventName: event.name,
      eventSlug: event.slug,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      status: reg.status,
      paymentStatus: reg.paymentStatus,
      paymentMethod: reg.paymentMethod,
      ticketType: reg.ticketType,
      priceCents: reg.priceCents,
      createdAt: reg.createdAt,
      cancelledAt: reg.cancelledAt,
      canCancel: portalCanCancel(reg, event, now),
      documents: docs
        .filter((d) => d.registrationId === reg.id)
        .map((d) => ({
          id: d.id,
          type: d.type,
          number: d.number,
          issuedAt: d.issuedAt,
          grossCents: d.grossCents,
          cancelled: d.type === 'invoice' && creditedCents(db, d.id) >= d.grossCents,
        })),
    })),
  };
}

/** Eigene Anmeldung laden oder NOT_FOUND (auch bei fremden Anmeldungen – keine Auskunft über deren Existenz). */
export function ownRegistration(db: Db, personId: number, registrationId: number) {
  const row = db
    .select({ reg: registrations, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(and(eq(registrations.id, registrationId), eq(registrations.personId, personId)))
    .get();
  if (!row) throw new ServiceError('NOT_FOUND');
  return row;
}

/** Eigener Beleg (Rechnung/Gutschrift zu einer eigenen Anmeldung) oder undefined. */
export function ownInvoice(db: Db, personId: number, invoiceId: number) {
  return db
    .select({ inv: invoices })
    .from(invoices)
    .innerJoin(registrations, eq(registrations.id, invoices.registrationId))
    .where(and(eq(invoices.id, invoiceId), eq(registrations.personId, personId)))
    .get()?.inv;
}

export type PortalCancelQuote = Pick<CancellationQuote, 'daysBefore' | 'rulePercent' | 'refundMode' | 'paymentMethod' | 'amounts' | 'paidCents'> & { status: string };

export function portalCancelQuote(db: Db, personId: number, registrationId: number, now = new Date()): PortalCancelQuote {
  const { reg, event } = ownRegistration(db, personId, registrationId);
  if (!portalCanCancel(reg, event, now)) throw new ServiceError('CONFLICT', { _form: 'cancelNotPossible' });
  const q = quoteCancellation(db, registrationId, now);
  return { status: reg.status, daysBefore: q.daysBefore, rulePercent: q.rulePercent, refundMode: q.refundMode, paymentMethod: q.paymentMethod, amounts: q.amounts, paidCents: q.paidCents };
}

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

export type OwnPersonInput = { firstName: string; lastName: string; company: string | null; phone: string | null; locale: 'de' | 'en' };

/** Eigene Stammdaten ändern (E-Mail-Adresse nur über den Veranstalter, da sie das Login ist). */
export function updateOwnPerson(db: Db, actor: Actor, personId: number, input: OwnPersonInput): void {
  db.transaction((tx) => {
    const person = tx.select().from(people).where(eq(people.id, personId)).get();
    if (!person || person.restrictedAt || person.anonymizedAt) throw new ServiceError('FORBIDDEN');
    tx.update(people)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(people.id, personId))
      .run();
    tx.update(authUsers)
      .set({ name: `${input.firstName} ${input.lastName}`.trim(), updatedAt: new Date() })
      .where(eq(authUsers.personId, personId))
      .run();
    const changed = (['firstName', 'lastName', 'company', 'phone', 'locale'] as const).filter((k) => (person[k] ?? null) !== (input[k] ?? null));
    writeAudit(tx, actor, {
      action: 'person.self_updated',
      entity: 'person',
      entityId: personId,
      summary: `Stammdaten im Portal geändert: ${changed.join(', ') || 'keine Änderung'}`,
    });
  });
}
