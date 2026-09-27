/**
 * Storno und Erstattung (Spezifikation 3.3).
 *
 * - Storno berechnet Gutschrift, Stornogebühr und Erstattung nach den Stornobedingungen (src/lib/refund-calc.ts);
 *   Admins dürfen den Erstattungssatz beim Stornieren abweichend festlegen.
 * - Erstattungen entstehen je Zahlung (refunds.payment_id). Status:
 *   proposed (wartet auf Freigabe) → approved (freigegeben) → executed; oder rejected / failed (erneut versuchbar).
 *   Admin-Entscheidungen sind sofort „approved“; Stornos von Teilnehmenden (Portal) je nach Erstattungsmodus des Events.
 * - Online-Zahlungen werden über die Kasse erstattet; Überweisungen verbucht ein Admin nach der Rücküberweisung.
 * - Jede ausgeführte Erstattung erzeugt eine Gutschrift zur Rechnung; der nicht mit einer Erstattung verbundene Teil
 *   (Storno einer noch unbezahlten Rechnung) wird sofort beim Storno gutgeschrieben.
 * - Erstattungen direkt im Stripe-Dashboard werden über den Webhook „charge.refunded“ nachgetragen.
 */
import { and, desc, eq, inArray, sum } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { cancellationAmounts, daysBeforeEvent, refundPercentFor, type CancellationAmounts } from '@/lib/refund-calc';
import { viennaDate, viennaInputToUtc } from '@/lib/dates';
import type { Db } from '@/server/db/core';
import { cancellationRules, events, invoices, payments, people, refunds, registrations } from '@/server/db/schema';
import { refunderFor, type Refunder } from '@/server/payments/refunds';
import { SYSTEM, writeAudit, type Actor, type Tx } from './audit';
import { activeInvoiceOf, creditedCents, issueCreditNote, paidCentsOf, type InvoiceRow } from './invoices';

export type RefundRow = typeof refunds.$inferSelect;
type RefundStatus = RefundRow['status'];

/** Beträge, die für eine Zahlung schon erstattet sind oder dafür vorgesehen sind. */
const COMMITTED: RefundStatus[] = ['proposed', 'approved', 'executed'];

function committedCents(tx: Tx | Db, paymentId: number, excludeRefundId?: number): number {
  const rows = tx
    .select({ id: refunds.id, amount: refunds.amountCents })
    .from(refunds)
    .where(and(eq(refunds.paymentId, paymentId), inArray(refunds.status, COMMITTED)))
    .all();
  return rows.filter((r) => r.id !== excludeRefundId).reduce((s, r) => s + r.amount, 0);
}

function succeededPayments(tx: Tx | Db, registrationId: number) {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.registrationId, registrationId), eq(payments.status, 'succeeded')))
    .orderBy(desc(payments.id))
    .all();
}

/** Noch erstattbarer Betrag einer Anmeldung (bezahlt minus bereits erstattete/vorgesehene Erstattungen). */
export function refundableCents(tx: Tx | Db, registrationId: number): number {
  return succeededPayments(tx, registrationId).reduce((s, p) => s + Math.max(0, p.amountCents - committedCents(tx, p.id)), 0);
}

/** Erstattbare Beträge aller Anmeldungen eines Events (für die Teilnehmerliste). */
export function refundableByRegistration(db: Db, eventId: number): Map<number, number> {
  const regIds = db
    .select({ id: payments.registrationId })
    .from(payments)
    .innerJoin(registrations, eq(registrations.id, payments.registrationId))
    .where(and(eq(registrations.eventId, eventId), eq(payments.status, 'succeeded')))
    .all();
  const result = new Map<number, number>();
  for (const { id } of regIds) if (id != null && !result.has(id)) result.set(id, refundableCents(db, id));
  return result;
}

// ---------------------------------------------------------------------------
// Storno
// ---------------------------------------------------------------------------

export type CancellationQuote = {
  registrationId: number;
  status: (typeof registrations.$inferSelect)['status'];
  paymentMethod: (typeof registrations.$inferSelect)['paymentMethod'];
  refundMode: 'automatic' | 'approval';
  daysBefore: number;
  rulePercent: number | null;
  invoiceNumber: string | null;
  /** noch gültiger Rechnungsbetrag (ohne Rechnung: erstattbarer Betrag) */
  invoiceCents: number;
  /** erstattbarer (bezahlter) Betrag */
  paidCents: number;
  amounts: CancellationAmounts;
};

function loadRegistrationWithEvent(tx: Tx | Db, registrationId: number) {
  const row = tx
    .select({ reg: registrations, event: events })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.id, registrationId))
    .get();
  if (!row) throw new ServiceError('NOT_FOUND');
  return row;
}

export function quoteCancellation(db: Db | Tx, registrationId: number, now = new Date()): CancellationQuote {
  const { reg, event } = loadRegistrationWithEvent(db, registrationId);
  const rules = db.select().from(cancellationRules).where(eq(cancellationRules.eventId, event.id)).all();
  const daysBefore = daysBeforeEvent(event.startsAt, now.toISOString());
  const rulePercent = refundPercentFor(rules, daysBefore);
  const invoice = activeInvoiceOf(db, { registrationId });
  const paid = refundableCents(db, registrationId);
  const invoiceCents = invoice ? invoice.grossCents - creditedCents(db, invoice.id) : paid;
  return {
    registrationId,
    status: reg.status,
    paymentMethod: reg.paymentMethod,
    refundMode: event.refundMode,
    daysBefore,
    rulePercent,
    invoiceNumber: invoice?.number ?? null,
    invoiceCents,
    paidCents: paid,
    amounts: cancellationAmounts({ invoiceCents, paidCents: paid, percent: rulePercent ?? 0 }),
  };
}

export type CancelOutcome = {
  eventId: number;
  percent: number;
  amounts: CancellationAmounts;
  /** freigegebene Erstattungen von Online-Zahlungen → sofort ausführen */
  executeIds: number[];
  refundIds: number[];
  refundStatus: 'none' | 'proposed' | 'approved';
  creditNote: InvoiceRow | null;
};

/** Erstattungen über mehrere Zahlungen verteilen (neueste zuerst). */
function allocateRefunds(
  tx: Tx,
  registrationId: number,
  amountCents: number,
  values: { status: 'proposed' | 'approved'; reason: string; rulePercent: number | null; decidedBy: string | null; now: string }
): RefundRow[] {
  let remaining = amountCents;
  const created: RefundRow[] = [];
  for (const p of succeededPayments(tx, registrationId)) {
    if (remaining <= 0) break;
    const free = p.amountCents - committedCents(tx, p.id);
    if (free <= 0) continue;
    const amount = Math.min(free, remaining);
    remaining -= amount;
    created.push(
      tx
        .insert(refunds)
        .values({
          paymentId: p.id,
          amountCents: amount,
          status: values.status,
          reason: values.reason,
          rulePercent: values.rulePercent,
          proposedAt: values.now,
          decidedBy: values.status === 'approved' ? values.decidedBy : null,
          decidedAt: values.status === 'approved' ? values.now : null,
        })
        .returning()
        .get()
    );
  }
  if (remaining > 0) throw new ServiceError('INVALID', { amount: 'outOfRange' });
  return created;
}

function methodOf(tx: Tx | Db, refund: RefundRow) {
  return tx.select().from(payments).where(eq(payments.id, refund.paymentId)).get()!;
}

/**
 * Anmeldung stornieren und Erstattung/Gutschrift nach Stornobedingungen anstoßen.
 * percent: abweichender Erstattungssatz (nur Admins); sonst laut Stornobedingungen.
 */
export function cancelRegistration(
  db: Db,
  actor: Actor,
  registrationId: number,
  input: { reason: string; percent?: number | null; source: 'admin' | 'attendee'; now?: Date }
): CancelOutcome {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const result = db.transaction(
    (tx) => {
      const { reg, event } = loadRegistrationWithEvent(tx, registrationId);
      if (event.archivedAt) throw new ServiceError('ARCHIVED');
      if (reg.status === 'cancelled') throw new ServiceError('CONFLICT');
      const quote = quoteCancellation(tx, registrationId, now);
      const custom = input.source === 'admin' && input.percent != null && input.percent !== (quote.rulePercent ?? 0);
      const percent = custom ? Math.min(100, Math.max(0, Math.round(input.percent!))) : (quote.rulePercent ?? 0);
      const amounts = cancellationAmounts({ invoiceCents: quote.invoiceCents, paidCents: quote.paidCents, percent });

      tx.update(registrations)
        .set({ status: 'cancelled', cancelledAt: nowIso, cancelReason: input.reason, reservedUntil: null })
        .where(eq(registrations.id, registrationId))
        .run();
      writeAudit(tx, actor, {
        action: 'registration.cancelled',
        entity: 'registration',
        entityId: registrationId,
        eventId: event.id,
        summary:
          `Storniert (${input.source === 'admin' ? 'Admin' : 'Teilnehmer:in'}, vorher ${reg.status}); Erstattungssatz ${percent} %` +
          (custom ? ' (abweichend von den Stornobedingungen)' : quote.rulePercent == null ? ' (keine Stornobedingungen)' : '') +
          `; Erstattung ${amounts.refundCents} Cent, Gutschrift ${amounts.creditCents} Cent, offen ${amounts.openCents} Cent`,
      });

      let created: RefundRow[] = [];
      let refundStatus: CancelOutcome['refundStatus'] = 'none';
      if (amounts.refundCents > 0) {
        refundStatus = input.source === 'admin' || event.refundMode === 'automatic' ? 'approved' : 'proposed';
        created = allocateRefunds(tx, registrationId, amounts.refundCents, {
          status: refundStatus,
          reason: `Stornierung: ${input.reason}`,
          rulePercent: percent,
          decidedBy: actor.userId,
          now: nowIso,
        });
        for (const r of created) {
          writeAudit(tx, actor, {
            action: refundStatus === 'approved' ? 'refund.approved' : 'refund.proposed',
            entity: 'refund',
            entityId: r.id,
            eventId: event.id,
            summary: `Erstattung ${r.amountCents} Cent (${percent} %) ${refundStatus === 'approved' ? 'freigegeben' : 'zur Freigabe vorgeschlagen'}`,
          });
        }
      }
      return { eventId: event.id, percent, amounts, created, refundStatus, paymentMethod: reg.paymentMethod };
    },
    { behavior: 'immediate' }
  );

  // Teil der Gutschrift, der nicht an eine Erstattung gebunden ist (offene Rechnung wird gemindert)
  let creditNote: InvoiceRow | null = null;
  const immediateCredit = result.amounts.creditCents - result.amounts.refundCents;
  const invoice = activeInvoiceOf(db, { registrationId });
  if (invoice && immediateCredit > 0) {
    creditNote = issueCreditNote(db, actor, invoice.id, { reason: input.reason, amountCents: Math.min(immediateCredit, invoice.grossCents - creditedCents(db, invoice.id)) }, now);
  }
  // nichts bezahlt und nichts mehr offen → keine Zahlung nötig
  if (result.amounts.openCents === 0 && result.amounts.refundCents === 0 && paidCentsOf(db, { registrationId }) === 0) {
    db.update(registrations).set({ paymentStatus: 'not_required' }).where(and(eq(registrations.id, registrationId), eq(registrations.paymentStatus, 'open'))).run();
  }

  const executeIds = result.refundStatus === 'approved' ? result.created.filter((r) => methodOf(db, r).method === 'stripe').map((r) => r.id) : [];
  return {
    eventId: result.eventId,
    percent: result.percent,
    amounts: result.amounts,
    executeIds,
    refundIds: result.created.map((r) => r.id),
    refundStatus: result.refundStatus,
    creditNote,
  };
}

// ---------------------------------------------------------------------------
// Manuelle Erstattung, Freigabe, Ablehnung
// ---------------------------------------------------------------------------

/** Erstattung ohne Storno (z. B. Kulanz), bis zum erstattbaren Betrag, mit Pflichtbegründung. */
export function createManualRefund(db: Db, actor: Actor, registrationId: number, input: { amountCents: number; reason: string; now?: Date }): RefundRow[] {
  const nowIso = (input.now ?? new Date()).toISOString();
  return db.transaction(
    (tx) => {
      const { event } = loadRegistrationWithEvent(tx, registrationId);
      if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new ServiceError('INVALID', { amount: 'amount' });
      if (input.amountCents > refundableCents(tx, registrationId)) throw new ServiceError('INVALID', { amount: 'refundTooHigh' });
      const created = allocateRefunds(tx, registrationId, input.amountCents, { status: 'approved', reason: input.reason, rulePercent: null, decidedBy: actor.userId, now: nowIso });
      for (const r of created) {
        writeAudit(tx, actor, { action: 'refund.approved', entity: 'refund', entityId: r.id, eventId: event.id, summary: `Manuelle Erstattung ${r.amountCents} Cent freigegeben` });
      }
      return created;
    },
    { behavior: 'immediate' }
  );
}

function loadRefund(tx: Tx | Db, refundId: number) {
  const refund = tx.select().from(refunds).where(eq(refunds.id, refundId)).get();
  if (!refund) throw new ServiceError('NOT_FOUND');
  const payment = methodOf(tx, refund);
  const reg = payment.registrationId ? tx.select().from(registrations).where(eq(registrations.id, payment.registrationId)).get()! : null;
  if (!reg) throw new ServiceError('NOT_FOUND');
  return { refund, payment, reg };
}

/** Vorschlag freigeben – optional mit geändertem Betrag (höchstens bis zum erstattbaren Rest der Zahlung). */
export function approveRefund(db: Db, actor: Actor, refundId: number, amountCents?: number, now = new Date()): RefundRow {
  return db.transaction(
    (tx) => {
      const { refund, payment, reg } = loadRefund(tx, refundId);
      if (refund.status !== 'proposed') throw new ServiceError('CONFLICT', { _form: 'refundNotOpen' });
      const amount = amountCents ?? refund.amountCents;
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > payment.amountCents - committedCents(tx, payment.id, refund.id)) {
        throw new ServiceError('INVALID', { amount: 'refundTooHigh' });
      }
      const row = tx
        .update(refunds)
        .set({ status: 'approved', amountCents: amount, decidedBy: actor.userId, decidedAt: now.toISOString() })
        .where(eq(refunds.id, refundId))
        .returning()
        .get();
      writeAudit(tx, actor, {
        action: 'refund.approved',
        entity: 'refund',
        entityId: refundId,
        eventId: reg.eventId,
        summary: `Erstattung freigegeben: ${amount} Cent${amount !== refund.amountCents ? ` (vorgeschlagen ${refund.amountCents} Cent)` : ''}`,
      });
      return row;
    },
    { behavior: 'immediate' }
  );
}

export function rejectRefund(db: Db, actor: Actor, refundId: number, note: string, now = new Date()): void {
  db.transaction(
    (tx) => {
      const { refund, reg } = loadRefund(tx, refundId);
      if (refund.status !== 'proposed' && refund.status !== 'failed' && refund.status !== 'approved') throw new ServiceError('CONFLICT', { _form: 'refundNotOpen' });
      tx.update(refunds)
        .set({ status: 'rejected', decidedBy: actor.userId, decidedAt: now.toISOString(), failureMessage: note.trim() || refund.failureMessage })
        .where(eq(refunds.id, refundId))
        .run();
      writeAudit(tx, actor, { action: 'refund.rejected', entity: 'refund', entityId: refundId, eventId: reg.eventId, summary: `Erstattung über ${refund.amountCents} Cent abgelehnt` });
    },
    { behavior: 'immediate' }
  );
}

// ---------------------------------------------------------------------------
// Ausführung
// ---------------------------------------------------------------------------

/**
 * Ausgeführte Erstattung(en) derselben Anmeldung verbuchen: Status, Zahlungsstatus der Anmeldung und
 * eine gemeinsame Gutschrift zur (noch gültigen) Rechnung.
 */
function finalizeRefunds(db: Db, actor: Actor, refundIds: number[], data: { stripeRefundId?: string | null; executedAt: string; now: Date }): RefundRow[] {
  const { rows, reg } = db.transaction(
    (tx) => {
      const rows = refundIds.map((id) => loadRefund(tx, id));
      const reg = rows[0].reg;
      if (rows.some((r) => r.reg.id !== reg.id)) throw new ServiceError('INVALID');
      for (const { refund } of rows) {
        tx.update(refunds)
          .set({ status: 'executed', executedAt: data.executedAt, stripeRefundId: data.stripeRefundId ?? refund.stripeRefundId, failureMessage: null })
          .where(eq(refunds.id, refund.id))
          .run();
        writeAudit(tx, actor, { action: 'refund.executed', entity: 'refund', entityId: refund.id, eventId: reg.eventId, summary: `Erstattung ${refund.amountCents} Cent ausgeführt` });
      }
      const paidGross = Number(
        tx.select({ s: sum(payments.amountCents) }).from(payments).where(and(eq(payments.registrationId, reg.id), eq(payments.status, 'succeeded'))).get()?.s ?? 0
      );
      const net = paidCentsOf(tx, { registrationId: reg.id });
      tx.update(registrations)
        .set({ paymentStatus: net <= 0 ? 'refunded' : net < paidGross ? 'partially_refunded' : reg.paymentStatus })
        .where(eq(registrations.id, reg.id))
        .run();
      return { rows: rows.map((r) => r.refund), reg };
    },
    { behavior: 'immediate' }
  );

  const invoice = activeInvoiceOf(db, { registrationId: reg.id });
  if (invoice) {
    const total = rows.reduce((s, r) => s + r.amountCents, 0);
    const amount = Math.min(total, invoice.grossCents - creditedCents(db, invoice.id));
    if (amount > 0) {
      const credit = issueCreditNote(db, actor, invoice.id, { reason: rows[0].reason, amountCents: amount }, data.now);
      db.update(refunds).set({ creditNoteId: credit.id }).where(inArray(refunds.id, refundIds)).run();
    }
  }
  return db.select().from(refunds).where(inArray(refunds.id, refundIds)).all();
}

export type ExecuteResult = { status: 'executed' | 'failed'; refund: RefundRow };

/** Freigegebene (oder fehlgeschlagene) Erstattung einer Online-Zahlung über die Kasse ausführen. */
export async function executeRefund(db: Db, actor: Actor, refundId: number, options: { refunder?: Refunder; now?: Date } = {}): Promise<ExecuteResult> {
  const now = options.now ?? new Date();
  const { refund, payment, reg } = loadRefund(db, refundId);
  if (refund.status !== 'approved' && refund.status !== 'failed') throw new ServiceError('CONFLICT', { _form: 'refundNotOpen' });
  if (payment.method !== 'stripe' || !payment.stripePaymentIntentId) throw new ServiceError('CONFLICT', { _form: 'refundNeedsTransfer' });

  const fail = (message: string): ExecuteResult => {
    db.transaction((tx) => {
      tx.update(refunds).set({ status: 'failed', failureMessage: message.slice(0, 500) }).where(eq(refunds.id, refundId)).run();
      writeAudit(tx, actor, { action: 'refund.failed', entity: 'refund', entityId: refundId, eventId: reg.eventId, summary: `Erstattung fehlgeschlagen: ${message.slice(0, 200)}` });
    });
    return { status: 'failed', refund: db.select().from(refunds).where(eq(refunds.id, refundId)).get()! };
  };
  // vor dem Aufruf auf „approved“ (zählt für den Abgleich mit dem Stripe-Webhook schon als vorgesehen)
  if (refund.status === 'failed') db.update(refunds).set({ status: 'approved' }).where(eq(refunds.id, refundId)).run();

  let result;
  try {
    result = await (options.refunder ?? refunderFor(payment.stripePaymentIntentId))({
      paymentIntentId: payment.stripePaymentIntentId,
      amountCents: refund.amountCents,
      refundId,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  if (result.status === 'failed') return fail(result.failureReason ?? 'Erstattung von der Kasse abgelehnt');
  const [done] = finalizeRefunds(db, actor, [refundId], { stripeRefundId: result.id, executedAt: now.toISOString(), now });
  return { status: 'executed', refund: done };
}

/**
 * Rücküberweisung verbuchen (nachdem der Admin überwiesen hat). Freigegebene Überweisungs-Erstattungen derselben
 * Anmeldung (bei mehreren Teilzahlungen) werden gemeinsam verbucht – eine Gutschrift, eine E-Mail.
 */
export function recordRefundTransfer(db: Db, actor: Actor, refundId: number, transferredOn: string, now = new Date()): RefundRow[] {
  const { refund, payment, reg } = loadRefund(db, refundId);
  if (refund.status !== 'approved') throw new ServiceError('CONFLICT', { _form: 'refundNotOpen' });
  if (payment.method !== 'bank_transfer') throw new ServiceError('CONFLICT', { _form: 'refundIsOnline' });
  const executedAt = viennaInputToUtc(`${transferredOn}T12:00`);
  if (!executedAt || transferredOn > viennaDate(now.toISOString())) throw new ServiceError('INVALID', { transferredOn: 'date' });
  const siblings = db
    .select({ id: refunds.id })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(eq(payments.registrationId, reg.id), eq(payments.method, 'bank_transfer'), eq(refunds.status, 'approved')))
    .all()
    .map((r) => r.id);
  return finalizeRefunds(db, actor, siblings, { executedAt, now });
}

/**
 * Webhook „charge.refunded“: Erstattungen, die nicht über EventFlow liefen (Stripe-Dashboard), nachtragen.
 * amountRefunded ist der Gesamtbetrag aller Erstattungen dieser Zahlung laut Stripe.
 */
export function syncExternalRefund(db: Db, paymentIntentId: string, amountRefunded: number, now = new Date()): RefundRow | null {
  const payment = db.select().from(payments).where(eq(payments.stripePaymentIntentId, paymentIntentId)).get();
  if (!payment || !payment.registrationId) return null;
  const known = db
    .select({ amount: refunds.amountCents })
    .from(refunds)
    .where(and(eq(refunds.paymentId, payment.id), inArray(refunds.status, ['approved', 'executed'])))
    .all()
    .reduce((s, r) => s + r.amount, 0);
  const diff = Math.min(amountRefunded, payment.amountCents) - known;
  if (diff <= 0) return null;
  const row = db.transaction((tx) => {
    const r = tx
      .insert(refunds)
      .values({ paymentId: payment.id, amountCents: diff, status: 'approved', reason: 'Erstattung direkt in Stripe', proposedAt: now.toISOString(), decidedAt: now.toISOString() })
      .returning()
      .get();
    const eventId = tx.select({ e: registrations.eventId }).from(registrations).where(eq(registrations.id, payment.registrationId!)).get()!.e;
    writeAudit(tx, SYSTEM, { action: 'refund.synced', entity: 'refund', entityId: r.id, eventId, summary: `Erstattung ${diff} Cent aus Stripe übernommen` });
    return r;
  });
  return finalizeRefunds(db, SYSTEM, [row.id], { executedAt: now.toISOString(), now })[0];
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export type RefundListRow = {
  id: number;
  registrationId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  method: 'stripe' | 'bank_transfer';
  amountCents: number;
  paymentCents: number;
  status: RefundStatus;
  reason: string;
  rulePercent: number | null;
  proposedAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  failureMessage: string | null;
  creditNoteNumber: string | null;
};

export function listRefunds(db: Db, eventId: number): RefundListRow[] {
  const rows = db
    .select({ r: refunds, p: payments, reg: registrations, person: people })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .innerJoin(registrations, eq(registrations.id, payments.registrationId))
    .innerJoin(people, eq(people.id, registrations.personId))
    .where(eq(registrations.eventId, eventId))
    .all();
  const creditIds = rows.map((r) => r.r.creditNoteId).filter((x): x is number => x != null);
  const numbers = new Map(creditIds.length ? db.select({ id: invoices.id, n: invoices.number }).from(invoices).where(inArray(invoices.id, creditIds)).all().map((i) => [i.id, i.n]) : []);
  const order: Record<RefundStatus, number> = { proposed: 0, failed: 1, approved: 2, executed: 3, rejected: 4 };
  return rows
    .map(({ r, p, reg, person }) => ({
      id: r.id,
      registrationId: reg.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      method: p.method,
      amountCents: r.amountCents,
      paymentCents: p.amountCents,
      status: r.status,
      reason: r.reason,
      rulePercent: r.rulePercent,
      proposedAt: r.proposedAt,
      decidedAt: r.decidedAt,
      executedAt: r.executedAt,
      failureMessage: r.failureMessage,
      creditNoteNumber: r.creditNoteId ? (numbers.get(r.creditNoteId) ?? null) : null,
    }))
    .sort((a, b) => order[a.status] - order[b.status] || b.proposedAt.localeCompare(a.proposedAt));
}

/** Anzahl offener Aufgaben (Vorschläge, fehlgeschlagene, freigegebene Überweisungen) je Event. */
export function openRefundTasks(db: Db, eventId: number): number {
  return listRefunds(db, eventId).filter((r) => r.status === 'proposed' || r.status === 'failed' || r.status === 'approved').length;
}
