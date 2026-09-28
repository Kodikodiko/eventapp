/**
 * Rechnungen und Gutschriften (Spezifikation 4.4, R1 – § 11 UStG).
 *
 * - Nummernkreis je Kalenderjahr (Wien), gemeinsam für Rechnungen und Gutschriften, z. B. 2026-0001.
 *   Die Nummer wird in derselben Schreibtransaktion (BEGIN IMMEDIATE) vergeben, in der der Beleg entsteht –
 *   dadurch lückenlos und ohne Doppelvergabe.
 * - Belege sind unveränderlich: Empfänger, Veranstalter (inkl. Bankdaten, Kleinunternehmer-Hinweis), Positionen
 *   und Beträge werden als Momentaufnahme gespeichert. Korrekturen nur über Gutschriften.
 * - Beträge: Preise sind brutto. Kleinunternehmer → USt-Satz 0; regulär → Satz der Position (Ticket/Paket).
 *   Gutschriften speichern positive Beträge; das Vorzeichen ergibt sich aus dem Typ.
 * - Aufbewahrung: 7 Jahre ab Ende des Ausstellungsjahres (§ 132 BAO) → retain_until.
 * - Zahlungseingang per Überweisung wird manuell verbucht; die Anmeldung bzw. der Sponsor gilt als bezahlt,
 *   sobald die Summe der Zahlungen den offenen Rechnungsbetrag erreicht.
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, max, or, sql, sum } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { viennaDate, viennaInputToUtc } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { splitGross } from '@/lib/money';
import type { Db } from '@/server/db/core';
import {
  events,
  invoiceCounters,
  invoices,
  organizerSettings,
  paymentReminders,
  payments,
  people,
  refunds,
  registrations,
  sponsorContacts,
  sponsorPackages,
  sponsors,
  type InvoiceItem,
  type InvoiceParty,
} from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';

export type InvoiceRow = typeof invoices.$inferSelect;

/** Aufbewahrungsfrist in Jahren ab Ende des Ausstellungsjahres (§ 132 BAO). */
export const INVOICE_RETENTION_YEARS = 7;
/** Zahlungserinnerungen: erste am Tag nach Fälligkeit, danach im Abstand von 14 Tagen, höchstens zwei. */
export const REMINDER_INTERVAL_DAYS = 14;
export const MAX_REMINDER_LEVEL = 2;

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

export function formatInvoiceNumber(year: number, n: number): string {
  return `${year}-${String(n).padStart(4, '0')}`;
}

/** Nächste Nummer des Jahres – nur innerhalb einer Schreibtransaktion aufrufen. */
export function nextInvoiceNumber(tx: Tx | Db, year: number): string {
  const row = tx
    .insert(invoiceCounters)
    .values({ year, lastNumber: 1 })
    .onConflictDoUpdate({ target: invoiceCounters.year, set: { lastNumber: sql`${invoiceCounters.lastNumber} + 1` } })
    .returning({ n: invoiceCounters.lastNumber })
    .get();
  return formatInvoiceNumber(year, row.n);
}

/** Letzter Aufbewahrungstag: 31.12. des Jahres Ausstellung + 7. */
export function retainUntil(issueDay: string): string {
  return `${Number(issueDay.slice(0, 4)) + INVOICE_RETENTION_YEARS}-12-31`;
}

/** Kalendertag (YYYY-MM-DD) + n Tage. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Leistungsdatum eines Events: ein Tag oder Zeitraum „von/bis“ (Wiener Kalendertage). */
export function eventServiceDate(event: { startsAt: string; endsAt: string }): string {
  const start = viennaDate(event.startsAt);
  const end = viennaDate(event.endsAt);
  return start === end ? start : `${start}/${end}`;
}

/** Eine Rechnungsposition aus einem Bruttobetrag. */
export function invoiceLine(description: string, grossCents: number, vatMode: 'small_business' | 'standard', vatRateBp: number): InvoiceItem {
  const rate = vatMode === 'small_business' ? 0 : vatRateBp;
  const split = splitGross(grossCents, rate);
  return { description, quantity: 1, unitGrossCents: grossCents, vatRateBp: rate, ...split };
}

export function sumItems(items: InvoiceItem[]) {
  return items.reduce(
    (acc, i) => ({ netCents: acc.netCents + i.netCents, vatCents: acc.vatCents + i.vatCents, grossCents: acc.grossCents + i.grossCents }),
    { netCents: 0, vatCents: 0, grossCents: 0 }
  );
}

function organizerSnapshot(tx: Tx | Db) {
  const org = tx.select().from(organizerSettings).where(eq(organizerSettings.id, 1)).get();
  if (!org || !org.name.trim() || !org.address.trim()) throw new ServiceError('CONFLICT', { _form: 'organizerIncomplete' });
  if (org.vatMode === 'standard' && !org.vatId?.trim()) throw new ServiceError('CONFLICT', { _form: 'organizerIncomplete' });
  const party: InvoiceParty = {
    name: org.name.trim(),
    address: org.address.trim(),
    vatId: org.vatId?.trim() || null,
    email: org.contactEmail?.trim() || null,
    iban: org.iban?.trim() || null,
    bic: org.bic?.trim() || null,
    smallBusinessNote: org.vatMode === 'small_business' ? org.smallBusinessNote : null,
  };
  return { org, party };
}

/** Bereits gutgeschriebener Betrag einer Rechnung. */
export function creditedCents(tx: Tx | Db, invoiceId: number): number {
  const row = tx
    .select({ s: sum(invoices.grossCents) })
    .from(invoices)
    .where(and(eq(invoices.relatedInvoiceId, invoiceId), eq(invoices.type, 'credit_note')))
    .get();
  return Number(row?.s ?? 0);
}

type Owner = { registrationId: number } | { sponsorId: number };

/** Aktuelle Rechnung einer Anmeldung bzw. eines Sponsors, die nicht vollständig gutgeschrieben ist. */
export function activeInvoiceOf(tx: Tx | Db, owner: Owner): InvoiceRow | undefined {
  const where =
    'registrationId' in owner ? eq(invoices.registrationId, owner.registrationId) : eq(invoices.sponsorId, owner.sponsorId);
  const rows = tx.select().from(invoices).where(and(where, eq(invoices.type, 'invoice'))).orderBy(asc(invoices.id)).all();
  return rows.reverse().find((inv) => creditedCents(tx, inv.id) < inv.grossCents);
}

export function hasPayments(tx: Tx | Db, owner: Owner): boolean {
  return paidCentsOf(tx, owner) > 0;
}

/** Bezahlter Betrag abzüglich ausgeführter Erstattungen. */
export function paidCentsOf(tx: Tx | Db, owner: Owner): number {
  const where =
    'registrationId' in owner ? eq(payments.registrationId, owner.registrationId) : eq(payments.sponsorId, owner.sponsorId);
  const row = tx.select({ s: sum(payments.amountCents) }).from(payments).where(and(where, eq(payments.status, 'succeeded'))).get();
  const refunded = tx
    .select({ s: sum(refunds.amountCents) })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(where, eq(refunds.status, 'executed')))
    .get();
  return Number(row?.s ?? 0) - Number(refunded?.s ?? 0);
}

function insertInvoice(
  tx: Tx,
  actor: Actor,
  values: Omit<typeof invoices.$inferInsert, 'number' | 'retainUntil' | 'issuedAt' | 'netCents' | 'vatCents' | 'grossCents'>,
  eventId: number,
  now: Date
): InvoiceRow {
  const issueDay = viennaDate(now.toISOString());
  const number = nextInvoiceNumber(tx, Number(issueDay.slice(0, 4)));
  const totals = sumItems(values.items as InvoiceItem[]);
  const row = tx
    .insert(invoices)
    .values({ ...values, ...totals, number, issuedAt: now.toISOString(), retainUntil: retainUntil(issueDay), createdBy: actor.userId })
    .returning()
    .get();
  writeAudit(tx, actor, {
    action: values.type === 'credit_note' ? 'credit_note.issued' : 'invoice.issued',
    entity: 'invoice',
    entityId: row.id,
    eventId,
    summary: `${values.type === 'credit_note' ? 'Gutschrift' : 'Rechnung'} ${number} über ${totals.grossCents} Cent${
      values.registrationId ? ` (Anmeldung ${values.registrationId})` : ` (Sponsor ${values.sponsorId})`
    }`,
  });
  return row;
}

// ---------------------------------------------------------------------------
// Ausstellen
// ---------------------------------------------------------------------------

const TICKET_LABEL = {
  de: { normal: 'Ticket', member: 'Mitgliedsticket' },
  en: { normal: 'Ticket', member: 'Member ticket' },
} as const;

/** Rechnung zu einer bestätigten, kostenpflichtigen Anmeldung. */
export function issueRegistrationInvoice(db: Db, actor: Actor, registrationId: number, now = new Date()): InvoiceRow {
  return db.transaction(
    (tx) => {
      const row = tx
        .select({ reg: registrations, person: people, event: events })
        .from(registrations)
        .innerJoin(people, eq(people.id, registrations.personId))
        .innerJoin(events, eq(events.id, registrations.eventId))
        .where(eq(registrations.id, registrationId))
        .get();
      if (!row) throw new ServiceError('NOT_FOUND');
      const { reg, person, event } = row;
      if (reg.status !== 'confirmed' || reg.paymentMethod === 'free' || reg.priceCents <= 0) {
        throw new ServiceError('CONFLICT', { _form: 'invoiceNotPossible' });
      }
      if (activeInvoiceOf(tx, { registrationId })) throw new ServiceError('CONFLICT', { _form: 'invoiceExists' });
      const { org, party } = organizerSnapshot(tx);

      const locale = person.locale;
      const description = [`${localized(event.name, locale)} – ${TICKET_LABEL[locale][reg.ticketType]}`, event.location.trim()]
        .filter(Boolean)
        .join('\n');
      const items = [invoiceLine(description, reg.priceCents, org.vatMode, event.ticketVatRateBp)];
      const paid = paidCentsOf(tx, { registrationId }) >= reg.priceCents || reg.paymentStatus === 'paid';
      const issueDay = viennaDate(now.toISOString());

      return insertInvoice(
        tx,
        actor,
        {
          type: 'invoice',
          registrationId,
          locale,
          serviceDate: eventServiceDate(event),
          dueAt: paid ? null : addDays(issueDay, org.invoicePaymentTermDays),
          recipient: {
            name: `${person.firstName} ${person.lastName}`.trim(),
            company: reg.billingCompany ?? person.company ?? null,
            address: reg.billingAddress ?? '',
            email: person.email,
          },
          organizer: party,
          items,
          vatMode: org.vatMode,
        },
        event.id,
        now
      );
    },
    { behavior: 'immediate' }
  );
}

/** Rechnung an einen Sponsor (Paketpreis, Rabatt als eigene Position). */
export function issueSponsorInvoice(db: Db, actor: Actor, sponsorId: number, now = new Date()): InvoiceRow {
  return db.transaction(
    (tx) => {
      const row = tx
        .select({ s: sponsors, pkg: sponsorPackages, event: events })
        .from(sponsors)
        .innerJoin(events, eq(events.id, sponsors.eventId))
        .leftJoin(sponsorPackages, eq(sponsorPackages.id, sponsors.packageId))
        .where(eq(sponsors.id, sponsorId))
        .get();
      if (!row) throw new ServiceError('NOT_FOUND');
      const { s, pkg, event } = row;
      if (!pkg || pkg.priceCents - s.discountCents <= 0) throw new ServiceError('CONFLICT', { _form: 'invoiceNotPossible' });
      if (!s.billingAddress.trim()) throw new ServiceError('CONFLICT', { _form: 'billingAddressMissing' });
      if (s.paymentStatus === 'paid') throw new ServiceError('CONFLICT', { _form: 'invoiceNotPossible' });
      if (activeInvoiceOf(tx, { sponsorId })) throw new ServiceError('CONFLICT', { _form: 'invoiceExists' });
      const { org, party } = organizerSnapshot(tx);

      const contact = tx
        .select({ p: people })
        .from(sponsorContacts)
        .innerJoin(people, eq(people.id, sponsorContacts.personId))
        .where(eq(sponsorContacts.sponsorId, sponsorId))
        .orderBy(asc(sponsorContacts.id))
        .get()?.p;
      const locale = contact?.locale ?? 'de';
      const packageLabel = locale === 'en' ? `Sponsoring package “${localized(pkg.name, 'en')}”` : `Sponsoringpaket „${localized(pkg.name, 'de')}“`;
      const items = [invoiceLine(`${packageLabel}\n${localized(event.name, locale)}`, pkg.priceCents, org.vatMode, pkg.vatRateBp)];
      if (s.discountCents > 0) {
        items.push(invoiceLine(locale === 'en' ? 'Discount' : 'Rabatt', -Math.min(s.discountCents, pkg.priceCents), org.vatMode, pkg.vatRateBp));
      }
      const issueDay = viennaDate(now.toISOString());
      const dueAt = s.dueOn && s.dueOn >= issueDay ? s.dueOn : addDays(issueDay, org.invoicePaymentTermDays);

      const invoice = insertInvoice(
        tx,
        actor,
        {
          type: 'invoice',
          sponsorId,
          locale,
          serviceDate: eventServiceDate(event),
          dueAt,
          recipient: {
            name: contact ? `${contact.firstName} ${contact.lastName}`.trim() : '',
            company: s.companyName,
            address: s.billingAddress.trim(),
            vatId: s.vatId?.trim() || null,
            email: contact?.email ?? null,
          },
          organizer: party,
          items,
          vatMode: org.vatMode,
        },
        event.id,
        now
      );
      tx.update(sponsors).set({ paymentStatus: 'invoiced', dueOn: dueAt }).where(eq(sponsors.id, sponsorId)).run();
      return invoice;
    },
    { behavior: 'immediate' }
  );
}

/**
 * Gutschrift zu einer Rechnung. Ohne Betrag wird der gesamte offene Rest gutgeschrieben (Positionen gespiegelt);
 * mit Betrag entsteht eine Position „Teilgutschrift“ zum Steuersatz der ersten Rechnungsposition.
 */
export function issueCreditNote(
  db: Db,
  actor: Actor,
  invoiceId: number,
  input: { reason: string; amountCents?: number },
  now = new Date()
): InvoiceRow {
  return db.transaction(
    (tx) => {
      const original = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!original) throw new ServiceError('NOT_FOUND');
      if (original.type !== 'invoice') throw new ServiceError('CONFLICT', { _form: 'invoiceNotPossible' });
      const remaining = original.grossCents - creditedCents(tx, invoiceId);
      const amount = input.amountCents ?? remaining;
      if (remaining <= 0) throw new ServiceError('CONFLICT', { _form: 'invoiceAlreadyCredited' });
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) throw new ServiceError('INVALID', { amount: 'outOfRange' });

      const { party } = organizerSnapshot(tx);
      const en = original.locale === 'en';
      const items: InvoiceItem[] =
        amount === original.grossCents
          ? original.items.map((i) => ({ ...i }))
          : [invoiceLine(en ? `Partial credit for invoice ${original.number}` : `Teilgutschrift zu Rechnung ${original.number}`, amount, original.vatMode, original.items[0]?.vatRateBp ?? 0)];

      const eventId = eventIdOfInvoice(tx, original);
      const note = input.reason.trim();
      const credit = insertInvoice(
        tx,
        actor,
        {
          type: 'credit_note',
          relatedInvoiceId: original.id,
          registrationId: original.registrationId,
          sponsorId: original.sponsorId,
          locale: original.locale,
          serviceDate: original.serviceDate,
          dueAt: null,
          recipient: original.recipient,
          organizer: party,
          items,
          vatMode: original.vatMode,
          note: note || null,
        },
        eventId,
        now
      );
      // Sponsor ohne gültige Rechnung und ohne Zahlung wieder auf „offen“
      if (original.sponsorId && amount === remaining && paidCentsOf(tx, { sponsorId: original.sponsorId }) === 0) {
        tx.update(sponsors)
          .set({ paymentStatus: 'open' })
          .where(and(eq(sponsors.id, original.sponsorId), inArray(sponsors.paymentStatus, ['invoiced', 'overdue'])))
          .run();
      }
      return credit;
    },
    { behavior: 'immediate' }
  );
}

/**
 * Rechnung stornieren (Korrektur, z. B. falsche Anschrift): volle Gutschrift, nur solange keine Zahlung
 * eingegangen ist. Bezahlte Rechnungen werden über die Erstattung (Phase 8) behandelt.
 */
export function cancelInvoice(db: Db, actor: Actor, invoiceId: number, reason: string, now = new Date()): InvoiceRow {
  const original = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!original) throw new ServiceError('NOT_FOUND');
  const owner: Owner = original.registrationId ? { registrationId: original.registrationId } : { sponsorId: original.sponsorId! };
  if (paidCentsOf(db, owner) > 0) throw new ServiceError('CONFLICT', { _form: 'invoiceHasPayments' });
  if (creditedCents(db, invoiceId) > 0) throw new ServiceError('CONFLICT', { _form: 'invoiceAlreadyCredited' });
  return issueCreditNote(db, actor, invoiceId, { reason }, now);
}

// ---------------------------------------------------------------------------
// Zahlungseingang
// ---------------------------------------------------------------------------

export type RecordPaymentResult = { paymentId: number; paidCents: number; openCents: number; fullyPaid: boolean };

/** Überweisung zu einer Rechnung verbuchen (Datum = Tag des Zahlungseingangs, Wiener Kalendertag). */
export function recordBankTransfer(
  db: Db,
  actor: Actor,
  invoiceId: number,
  input: { amountCents: number; paidOn: string },
  now = new Date()
): RecordPaymentResult {
  return db.transaction(
    (tx) => {
      const invoice = tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
      if (!invoice) throw new ServiceError('NOT_FOUND');
      if (invoice.type !== 'invoice') throw new ServiceError('CONFLICT', { _form: 'invoiceNotPossible' });
      const due = invoice.grossCents - creditedCents(tx, invoiceId);
      if (due <= 0) throw new ServiceError('CONFLICT', { _form: 'invoiceAlreadyCredited' });
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new ServiceError('INVALID', { amount: 'amount' });
      const paidAt = viennaInputToUtc(`${input.paidOn}T12:00`);
      if (!paidAt || input.paidOn > viennaDate(now.toISOString())) throw new ServiceError('INVALID', { paidOn: 'date' });

      const owner: Owner = invoice.registrationId ? { registrationId: invoice.registrationId } : { sponsorId: invoice.sponsorId! };
      const payment = tx
        .insert(payments)
        .values({
          ...('registrationId' in owner ? { registrationId: owner.registrationId } : { sponsorId: owner.sponsorId }),
          method: 'bank_transfer',
          status: 'succeeded',
          amountCents: input.amountCents,
          paidAt,
          recordedBy: actor.userId,
          createdAt: now.toISOString(),
        })
        .returning({ id: payments.id })
        .get();
      const paidCents = paidCentsOf(tx, owner);
      const fullyPaid = paidCents >= due;
      if (fullyPaid) {
        if ('registrationId' in owner) {
          tx.update(registrations).set({ paymentStatus: 'paid' }).where(and(eq(registrations.id, owner.registrationId), eq(registrations.paymentStatus, 'open'))).run();
        } else {
          tx.update(sponsors).set({ paymentStatus: 'paid' }).where(eq(sponsors.id, owner.sponsorId)).run();
        }
      }
      writeAudit(tx, actor, {
        action: 'payment.recorded',
        entity: 'invoice',
        entityId: invoiceId,
        eventId: eventIdOfInvoice(tx, invoice),
        summary: `Überweisung ${input.amountCents} Cent vom ${input.paidOn} zu Rechnung ${invoice.number} verbucht${fullyPaid ? ', vollständig bezahlt' : `, offen ${due - paidCents} Cent`}`,
      });
      return { paymentId: payment.id, paidCents, openCents: Math.max(0, due - paidCents), fullyPaid };
    },
    { behavior: 'immediate' }
  );
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export function getInvoice(db: Db | Tx, id: number): InvoiceRow | undefined {
  return db.select().from(invoices).where(eq(invoices.id, id)).get();
}

export function eventIdOfInvoice(db: Db | Tx, invoice: Pick<InvoiceRow, 'registrationId' | 'sponsorId'>): number {
  if (invoice.registrationId) {
    return db.select({ e: registrations.eventId }).from(registrations).where(eq(registrations.id, invoice.registrationId)).get()!.e;
  }
  return db.select({ e: sponsors.eventId }).from(sponsors).where(eq(sponsors.id, invoice.sponsorId!)).get()!.e;
}

export type InvoiceState = 'open' | 'overdue' | 'paid' | 'cancelled' | 'credit_note';

export type InvoiceListRow = {
  id: number;
  type: 'invoice' | 'credit_note';
  number: string;
  relatedNumber: string | null;
  issuedAt: string;
  dueAt: string | null;
  sentAt: string | null;
  recipientName: string;
  recipientCompany: string | null;
  kind: 'registration' | 'sponsor';
  registrationId: number | null;
  sponsorId: number | null;
  grossCents: number;
  creditedCents: number;
  paidCents: number;
  openCents: number;
  state: InvoiceState;
  reminderLevel: number;
};

/** Alle Belege eines Events (Anmeldungen und Sponsoren), neueste zuerst. */
export function listInvoices(db: Db, eventId: number, now = new Date()): InvoiceListRow[] {
  const today = viennaDate(now.toISOString());
  const rows = db
    .select({ inv: invoices, reg: registrations, sp: sponsors })
    .from(invoices)
    .leftJoin(registrations, eq(registrations.id, invoices.registrationId))
    .leftJoin(sponsors, eq(sponsors.id, invoices.sponsorId))
    .where(or(eq(registrations.eventId, eventId), eq(sponsors.eventId, eventId)))
    .all();
  const numbers = new Map(rows.map((r) => [r.inv.id, r.inv.number]));
  const credited = new Map<number, number>();
  for (const { inv } of rows) {
    if (inv.type === 'credit_note' && inv.relatedInvoiceId) credited.set(inv.relatedInvoiceId, (credited.get(inv.relatedInvoiceId) ?? 0) + inv.grossCents);
  }
  const ids = rows.map((r) => r.inv.id);
  const levels = new Map(
    ids.length
      ? db
          .select({ id: paymentReminders.invoiceId, level: max(paymentReminders.level) })
          .from(paymentReminders)
          .where(inArray(paymentReminders.invoiceId, ids))
          .groupBy(paymentReminders.invoiceId)
          .all()
          .map((r) => [r.id, r.level ?? 0])
      : []
  );

  return rows
    .map(({ inv, reg, sp }): InvoiceListRow => {
      const owner: Owner = inv.registrationId ? { registrationId: inv.registrationId } : { sponsorId: inv.sponsorId! };
      const creditedC = credited.get(inv.id) ?? 0;
      const due = inv.grossCents - creditedC;
      const paidC = inv.type === 'invoice' ? paidCentsOf(db, owner) : 0;
      const ownerPaid = reg ? ['paid', 'partially_refunded', 'refunded'].includes(reg.paymentStatus) : sp?.paymentStatus === 'paid';
      let state: InvoiceState;
      if (inv.type === 'credit_note') state = 'credit_note';
      else if (due <= 0) state = 'cancelled';
      else if (ownerPaid || paidC >= due) state = 'paid';
      else if (inv.dueAt && inv.dueAt < today) state = 'overdue';
      else state = 'open';
      return {
        id: inv.id,
        type: inv.type,
        number: inv.number,
        relatedNumber: inv.relatedInvoiceId ? (numbers.get(inv.relatedInvoiceId) ?? null) : null,
        issuedAt: inv.issuedAt,
        dueAt: inv.dueAt,
        sentAt: inv.sentAt,
        recipientName: inv.recipient.name,
        recipientCompany: inv.recipient.company ?? null,
        kind: inv.registrationId ? 'registration' : 'sponsor',
        registrationId: inv.registrationId,
        sponsorId: inv.sponsorId,
        grossCents: inv.grossCents,
        creditedCents: creditedC,
        paidCents: paidC,
        openCents: state === 'open' || state === 'overdue' ? Math.max(0, due - paidC) : 0,
        state,
        reminderLevel: levels.get(inv.id) ?? 0,
      };
    })
    .sort((a, b) => b.number.localeCompare(a.number));
}

/** Aktive (nicht vollständig gutgeschriebene) Rechnungen je Anmeldung eines Events: Nummer und Fälligkeit. */
export function activeInvoicesByRegistration(db: Db, eventId: number): Map<number, { number: string; dueAt: string | null }> {
  const rows = db
    .select({ inv: invoices })
    .from(invoices)
    .innerJoin(registrations, eq(registrations.id, invoices.registrationId))
    .where(and(eq(registrations.eventId, eventId), eq(invoices.type, 'invoice')))
    .all();
  const result = new Map<number, { number: string; dueAt: string | null }>();
  for (const { inv } of rows) if (creditedCents(db, inv.id) < inv.grossCents) result.set(inv.registrationId!, { number: inv.number, dueAt: inv.dueAt });
  return result;
}

/** Aktive Rechnungen je Anmeldung eines Events (für die Teilnehmerliste). */
export function activeInvoiceNumbersByRegistration(db: Db, eventId: number): Map<number, string> {
  return new Map([...activeInvoicesByRegistration(db, eventId)].map(([id, inv]) => [id, inv.number]));
}

export function activeInvoiceNumbersBySponsor(db: Db, eventId: number): Map<number, string> {
  const rows = db
    .select({ inv: invoices })
    .from(invoices)
    .innerJoin(sponsors, eq(sponsors.id, invoices.sponsorId))
    .where(and(eq(sponsors.eventId, eventId), eq(invoices.type, 'invoice')))
    .all();
  const result = new Map<number, string>();
  for (const { inv } of rows) if (creditedCents(db, inv.id) < inv.grossCents) result.set(inv.sponsorId!, inv.number);
  return result;
}

/**
 * Aktuelle E-Mail-Adresse für den Versand eines Belegs: Person der Anmeldung bzw. erste Sponsor-Kontaktperson.
 * Eingeschränkte oder anonymisierte Personen erhalten keine E-Mails (DSGVO 7.4).
 */
export function invoiceRecipient(db: Db, invoice: InvoiceRow): { email: string; firstName: string; lastName: string; locale: 'de' | 'en' } | null {
  let person: typeof people.$inferSelect | undefined;
  if (invoice.registrationId) {
    person = db
      .select({ p: people })
      .from(registrations)
      .innerJoin(people, eq(people.id, registrations.personId))
      .where(eq(registrations.id, invoice.registrationId))
      .get()?.p;
  } else {
    person = db
      .select({ p: people })
      .from(sponsorContacts)
      .innerJoin(people, eq(people.id, sponsorContacts.personId))
      .where(and(eq(sponsorContacts.sponsorId, invoice.sponsorId!), isNotNull(people.email), isNull(people.restrictedAt)))
      .orderBy(asc(sponsorContacts.id))
      .get()?.p;
  }
  if (!person?.email || person.restrictedAt || person.anonymizedAt) return null;
  return { email: person.email, firstName: person.firstName, lastName: person.lastName, locale: invoice.locale };
}

export function markInvoiceSent(db: Db, invoiceId: number, now = new Date()): void {
  db.update(invoices).set({ sentAt: now.toISOString() }).where(eq(invoices.id, invoiceId)).run();
}

// ---------------------------------------------------------------------------
// Zahlungserinnerungen
// ---------------------------------------------------------------------------

export type DueReminder = { invoice: InvoiceRow; level: number; openCents: number };

/** Rechnungen, für die jetzt eine Zahlungserinnerung fällig ist. */
export function findDueReminders(db: Db, now = new Date()): DueReminder[] {
  const today = viennaDate(now.toISOString());
  const candidates = db
    .select({ inv: invoices, reg: registrations, sp: sponsors })
    .from(invoices)
    .leftJoin(registrations, eq(registrations.id, invoices.registrationId))
    .leftJoin(sponsors, eq(sponsors.id, invoices.sponsorId))
    .where(and(eq(invoices.type, 'invoice'), isNotNull(invoices.dueAt), sql`${invoices.dueAt} < ${today}`))
    .all();
  const result: DueReminder[] = [];
  for (const { inv, reg, sp } of candidates) {
    // auch stornierte Anmeldungen: eine offene Stornogebühr wird weiter eingemahnt
    if (reg && reg.paymentStatus !== 'open') continue;
    if (sp && sp.paymentStatus === 'paid') continue;
    const owner: Owner = inv.registrationId ? { registrationId: inv.registrationId } : { sponsorId: inv.sponsorId! };
    const openCents = inv.grossCents - creditedCents(db, inv.id) - paidCentsOf(db, owner);
    if (openCents <= 0) continue;
    const last = db
      .select({ level: paymentReminders.level, sentAt: paymentReminders.sentAt })
      .from(paymentReminders)
      .where(eq(paymentReminders.invoiceId, inv.id))
      .orderBy(sql`${paymentReminders.level} DESC`)
      .get();
    const level = (last?.level ?? 0) + 1;
    if (level > MAX_REMINDER_LEVEL) continue;
    if (last && addDays(viennaDate(last.sentAt), REMINDER_INTERVAL_DAYS) > today) continue;
    result.push({ invoice: inv, level, openCents });
  }
  return result;
}

/** Erinnerung vor dem Versand „belegen“ (verhindert Doppelversand bei parallelen Läufen). */
export function claimReminder(db: Db, invoiceId: number, level: number, now = new Date()): boolean {
  const r = db.insert(paymentReminders).values({ invoiceId, level, sentAt: now.toISOString() }).onConflictDoNothing().run();
  return r.changes > 0;
}

/** Versand fehlgeschlagen: Beleg wieder freigeben, damit der nächste Lauf es erneut versucht. */
export function releaseReminder(db: Db, invoiceId: number, level: number): void {
  db.delete(paymentReminders).where(and(eq(paymentReminders.invoiceId, invoiceId), eq(paymentReminders.level, level))).run();
}

export function recordReminderAudit(db: Db, invoice: InvoiceRow, level: number): void {
  writeAudit(db, { userId: null }, {
    action: 'invoice.reminder_sent',
    entity: 'invoice',
    entityId: invoice.id,
    eventId: eventIdOfInvoice(db, invoice),
    summary: `Zahlungserinnerung ${level} zu Rechnung ${invoice.number}`,
  });
}

/** Sponsoren mit überfälliger Rechnung auf „überfällig“ setzen. Gibt die Anzahl zurück. */
export function markOverdueSponsors(db: Db, now = new Date()): number {
  const today = viennaDate(now.toISOString());
  let n = 0;
  const rows = db
    .select({ inv: invoices, sp: sponsors })
    .from(invoices)
    .innerJoin(sponsors, eq(sponsors.id, invoices.sponsorId))
    .where(and(eq(invoices.type, 'invoice'), eq(sponsors.paymentStatus, 'invoiced'), isNotNull(invoices.dueAt), sql`${invoices.dueAt} < ${today}`))
    .all();
  for (const { inv, sp } of rows) {
    if (creditedCents(db, inv.id) >= inv.grossCents) continue;
    db.transaction((tx) => {
      tx.update(sponsors).set({ paymentStatus: 'overdue' }).where(eq(sponsors.id, sp.id)).run();
      writeAudit(tx, { userId: null }, { action: 'sponsor.overdue', entity: 'sponsor', entityId: sp.id, eventId: sp.eventId, summary: `Rechnung ${inv.number} überfällig` });
    });
    n++;
  }
  return n;
}

/** Online bezahlte, bestätigte Anmeldungen ohne Rechnung (Sicherheitsnetz, falls die Ausstellung nach der Zahlung scheiterte). */
export function paidRegistrationsWithoutInvoice(db: Db, olderThan: Date): number[] {
  const rows = db
    .select({ id: registrations.id, n: count(invoices.id) })
    .from(registrations)
    .leftJoin(invoices, eq(invoices.registrationId, registrations.id))
    .where(
      and(
        eq(registrations.status, 'confirmed'),
        eq(registrations.paymentMethod, 'stripe'),
        eq(registrations.paymentStatus, 'paid'),
        sql`${registrations.priceCents} > 0`,
        sql`${registrations.confirmedAt} < ${olderThan.toISOString()}`
      )
    )
    .groupBy(registrations.id)
    .all();
  return rows.filter((r) => r.n === 0).map((r) => r.id);
}
