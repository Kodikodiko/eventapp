/**
 * Zahlungsstatus einer Anmeldung von Hand ändern (Teilnehmerliste), mit Pflichtnotiz im Protokoll.
 *
 * Erlaubte Wechsel:
 * - offen → bezahlt: verbucht den offenen Betrag als Zahlungseingang (Überweisung/bar, mit Datum) –
 *   mit Rechnung über recordBankTransfer, sonst direkt an der Anmeldung. So sind spätere Erstattungen möglich.
 * - offen → nicht nötig (Zahlung erlassen): nur ohne Zahlungseingang und ohne gültige Rechnung.
 * - nicht nötig → offen: nur bei Preis über 0.
 * - bezahlt → offen (Fehlbuchung zurücknehmen): nur für von Hand verbuchte Zahlungen ohne Erstattungen;
 *   die Zahlungen werden als „failed“ markiert, nicht gelöscht.
 * „Teilweise erstattet“/„Erstattet“ ergeben sich nur aus Erstattungen.
 *
 * Vorbereitung für den späteren Import einer Zahlungsdatei (Bankauszug): markRegistrationPaid ist der
 * Einstiegspunkt je erkannter Zahlung.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { viennaDate, viennaInputToUtc } from '@/lib/dates';
import { formatEuro } from '@/lib/money';
import type { Db } from '@/server/db/core';
import { events, payments, refunds, registrations } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';
import { activeInvoiceOf, creditedCents, paidCentsOf, recordBankTransfer } from './invoices';

export type ManualPaymentStatus = 'open' | 'paid' | 'not_required';
type PaymentStatus = (typeof registrations.$inferSelect)['paymentStatus'];

const LABEL: Record<PaymentStatus, string> = {
  open: 'Offen',
  paid: 'Bezahlt',
  partially_refunded: 'Teilweise erstattet',
  refunded: 'Erstattet',
  not_required: 'Nicht nötig',
};

function load(tx: Tx | Db, registrationId: number) {
  const row = tx
    .select({ reg: registrations, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.id, registrationId))
    .get();
  if (!row) throw new ServiceError('NOT_FOUND');
  if (row.event.archivedAt) throw new ServiceError('ARCHIVED');
  return row;
}

/** Noch offener Betrag: gültige Rechnung (abzüglich Gutschriften) bzw. Ticketpreis, minus Zahlungseingänge. */
export function openPaymentCents(tx: Tx | Db, registrationId: number): number {
  const reg = tx.select().from(registrations).where(eq(registrations.id, registrationId)).get();
  if (!reg) throw new ServiceError('NOT_FOUND');
  const invoice = activeInvoiceOf(tx, { registrationId });
  const due = invoice ? invoice.grossCents - creditedCents(tx, invoice.id) : reg.priceCents;
  return Math.max(0, due - paidCentsOf(tx, { registrationId }));
}

/** Von Hand verbuchte Zahlungen ohne Erstattungen (nur diese lassen sich zurücknehmen). */
function reversiblePayments(tx: Tx | Db, registrationId: number) {
  const rows = tx
    .select()
    .from(payments)
    .where(and(eq(payments.registrationId, registrationId), eq(payments.status, 'succeeded')))
    .all();
  if (rows.length === 0) return [];
  if (rows.some((p) => p.method !== 'bank_transfer' || !p.recordedBy)) return null;
  const withRefunds = tx
    .select({ id: refunds.id })
    .from(refunds)
    .where(and(inArray(refunds.paymentId, rows.map((p) => p.id)), inArray(refunds.status, ['proposed', 'approved', 'executed', 'failed'])))
    .all();
  return withRefunds.length > 0 ? null : rows;
}

/** Welche Zielstatus sind für diese Anmeldung gerade möglich? (für den Dialog) */
export type PaymentStatusOptions = { current: PaymentStatus; openCents: number; targets: ManualPaymentStatus[]; hasInvoice: boolean };

export function paymentStatusOptions(db: Db | Tx, registrationId: number): PaymentStatusOptions {
  const reg = db.select().from(registrations).where(eq(registrations.id, registrationId)).get();
  if (!reg) throw new ServiceError('NOT_FOUND');
  const hasInvoice = Boolean(activeInvoiceOf(db, { registrationId }));
  const paid = paidCentsOf(db, { registrationId });
  const targets: ManualPaymentStatus[] = [];
  if (reg.paymentStatus === 'open') {
    if (reg.priceCents > 0 || hasInvoice) targets.push('paid');
    if (paid === 0 && !hasInvoice) targets.push('not_required');
  } else if (reg.paymentStatus === 'not_required') {
    if (reg.priceCents > 0) targets.push('open', 'paid');
  } else if (reg.paymentStatus === 'paid') {
    if (reversiblePayments(db, registrationId) !== null) targets.push('open');
  }
  return { current: reg.paymentStatus, openCents: openPaymentCents(db, registrationId), targets, hasInvoice };
}

export type SetPaymentStatusInput = {
  status: ManualPaymentStatus;
  /** Begründung/Beleg, landet im Protokoll */
  note: string;
  /** Tag des Zahlungseingangs (YYYY-MM-DD, Wien) – nur für „bezahlt“ */
  paidOn?: string;
  /** Herkunft der Änderung, z. B. „Zahlungsdatei“ beim späteren Import */
  via?: string;
};

/**
 * Zahlungsstatus von Hand setzen. Schreibt immer einen Protokolleintrag „payment.status_changed“
 * mit altem und neuem Status und der Notiz.
 */
export function setPaymentStatusManually(db: Db, actor: Actor, registrationId: number, input: SetPaymentStatusInput, now = new Date()): PaymentStatus {
  const note = input.note.trim();
  if (!note) throw new ServiceError('INVALID', { note: 'required' });
  const { reg } = load(db, registrationId);
  const options = paymentStatusOptions(db, registrationId);
  if (!options.targets.includes(input.status)) throw new ServiceError('CONFLICT', { _form: 'paymentStatusNotPossible' });
  const from = reg.paymentStatus;
  let detail = '';

  if (input.status === 'paid') {
    const paidOn = input.paidOn ?? viennaDate(now.toISOString());
    const paidAt = viennaInputToUtc(`${paidOn}T12:00`);
    if (!paidAt || paidOn > viennaDate(now.toISOString())) throw new ServiceError('INVALID', { paidOn: 'date' });
    // „nicht nötig“ → „bezahlt“: zuerst wieder als offen behandeln
    if (from === 'not_required') {
      db.update(registrations).set({ paymentStatus: 'open', paymentMethod: reg.paymentMethod === 'free' ? 'invoice' : reg.paymentMethod }).where(eq(registrations.id, registrationId)).run();
    }
    const amount = openPaymentCents(db, registrationId);
    const invoice = activeInvoiceOf(db, { registrationId });
    if (invoice && amount > 0) {
      recordBankTransfer(db, actor, invoice.id, { amountCents: amount, paidOn }, now);
    } else if (amount > 0) {
      db.insert(payments)
        .values({ registrationId, method: 'bank_transfer', status: 'succeeded', amountCents: amount, paidAt, recordedBy: actor.userId, createdAt: now.toISOString() })
        .run();
    }
    db.update(registrations).set({ paymentStatus: 'paid' }).where(eq(registrations.id, registrationId)).run();
    detail = amount > 0 ? `; Zahlungseingang ${formatEuro(amount, 'de')} vom ${paidOn} verbucht` : '';
  } else if (input.status === 'open') {
    db.transaction(
      (tx) => {
        if (from === 'paid') {
          const rows = reversiblePayments(tx, registrationId);
          if (rows === null) throw new ServiceError('CONFLICT', { _form: 'paymentStatusNotPossible' });
          if (rows.length) tx.update(payments).set({ status: 'failed' }).where(inArray(payments.id, rows.map((p) => p.id))).run();
          const total = rows.reduce((s, p) => s + p.amountCents, 0);
          if (total > 0) detail = `; Zahlungseingang ${formatEuro(total, 'de')} zurückgenommen`;
        }
        tx.update(registrations)
          .set({ paymentStatus: 'open', paymentMethod: reg.paymentMethod === 'free' ? 'invoice' : reg.paymentMethod })
          .where(eq(registrations.id, registrationId))
          .run();
      },
      { behavior: 'immediate' }
    );
  } else {
    db.update(registrations).set({ paymentStatus: 'not_required' }).where(eq(registrations.id, registrationId)).run();
  }

  writeAudit(db, actor, {
    action: 'payment.status_changed',
    entity: 'registration',
    entityId: registrationId,
    eventId: reg.eventId,
    summary: `Zahlungsstatus von Hand geändert${input.via ? ` (${input.via})` : ''}: ${LABEL[from]} → ${LABEL[input.status]}${detail}. Notiz: ${note.slice(0, 300)}`,
  });
  return input.status;
}

/** Einstiegspunkt für den späteren Import einer Zahlungsdatei: Anmeldung als bezahlt verbuchen. */
export function markRegistrationPaid(db: Db, actor: Actor, registrationId: number, input: { paidOn: string; note: string; via?: string }, now = new Date()) {
  return setPaymentStatusManually(db, actor, registrationId, { status: 'paid', ...input }, now);
}
