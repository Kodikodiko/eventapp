/**
 * Abläufe rund um Storno und Erstattung, die Datenbank, Kasse und E-Mail verbinden.
 * Fachliche Regeln liegen in ./refunds.ts; hier: Reihenfolge, Versand, Fehlertoleranz.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { events, invoices, payments, people, refunds, registrations } from '@/server/db/schema';
import { invoicePdf } from '@/server/invoices/storage';
import { getMailer, trySend, type Mailer } from '@/server/mail';
import { cancellationMail, refundMail } from '@/server/mail/templates';
import type { Refunder } from '@/server/payments/refunds';
import { writeAudit, type Actor } from './audit';
import { activeInvoiceOf, markInvoiceSent } from './invoices';
import { mailOrganizer } from './notifications';
import { cancelRegistration, executeRefund, type CancelOutcome, type RefundRow } from './refunds';

type Options = { mailer?: Mailer; refunder?: Refunder; now?: Date };

function personOfRegistration(db: Db, registrationId: number) {
  return db
    .select({ reg: registrations, person: people, event: events })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.id, registrationId))
    .get()!;
}

const reachable = (p: typeof people.$inferSelect) => Boolean(p.email && !p.restrictedAt && !p.anonymizedAt);

async function creditAttachment(db: Db, creditNoteId: number | null) {
  if (!creditNoteId) return null;
  const credit = db.select().from(invoices).where(eq(invoices.id, creditNoteId)).get();
  if (!credit) return null;
  const pdf = await invoicePdf(db, credit);
  return { invoice: credit, number: credit.number, attachment: { filename: pdf.fileName, content: pdf.content, contentType: 'application/pdf' } };
}

/** E-Mail nach ausgeführter Erstattung (mehrere Teil-Erstattungen gemeinsam, mit Gutschrift im Anhang). */
export async function sendRefundMail(db: Db, refundOrGroup: RefundRow | RefundRow[], mailer: Mailer = getMailer(), now = new Date()): Promise<boolean> {
  const group = Array.isArray(refundOrGroup) ? refundOrGroup : [refundOrGroup];
  const payment = db.select().from(payments).where(eq(payments.id, group[0].paymentId)).get()!;
  const { person, event } = personOfRegistration(db, payment.registrationId!);
  if (!reachable(person)) return false;
  const credit = await creditAttachment(db, group[0].creditNoteId);
  const ok = await trySend(
    refundMail({
      email: person.email!,
      firstName: person.firstName,
      lastName: person.lastName,
      locale: person.locale,
      eventName: event.name,
      amountCents: group.reduce((s, r) => s + r.amountCents, 0),
      method: payment.method,
      creditNote: credit ? { number: credit.number, attachment: credit.attachment } : null,
      organizer: mailOrganizer(db),
    }),
    mailer
  );
  if (ok && credit) markInvoiceSent(db, credit.invoice.id, now);
  return ok;
}

/** Erstattung über die Kasse ausführen und bei Erfolg die E-Mail senden. */
export async function executeRefundAndNotify(db: Db, actor: Actor, refundId: number, options: Options = {}) {
  const result = await executeRefund(db, actor, refundId, { refunder: options.refunder, now: options.now });
  if (result.status === 'executed') await sendRefundMail(db, result.refund, options.mailer, options.now);
  return result;
}

export type CancelProcessResult = CancelOutcome & { mailed: boolean; failedRefunds: number };

/**
 * Stornieren: Erstattung/Gutschrift berechnen, Stornobestätigung senden (auf Wunsch), freigegebene
 * Online-Erstattungen sofort ausführen.
 */
export async function cancelAndProcess(
  db: Db,
  actor: Actor,
  registrationId: number,
  input: { reason: string; percent?: number | null; source: 'admin' | 'attendee'; notify: boolean },
  options: Options = {}
): Promise<CancelProcessResult> {
  const now = options.now ?? new Date();
  const paidBefore = db
    .select({ amount: payments.amountCents })
    .from(payments)
    .where(eq(payments.registrationId, registrationId))
    .all()
    .reduce((s, p) => s + p.amount, 0);
  const outcome = cancelRegistration(db, actor, registrationId, { ...input, now });
  const { person, event } = personOfRegistration(db, registrationId);

  let mailed = false;
  if (input.notify && reachable(person)) {
    const credit = outcome.creditNote ? await creditAttachment(db, outcome.creditNote.id) : null;
    const invoice = activeInvoiceOf(db, { registrationId }) ?? (outcome.creditNote?.relatedInvoiceId ? db.select().from(invoices).where(eq(invoices.id, outcome.creditNote.relatedInvoiceId)).get() : undefined);
    const firstRefund = outcome.refundIds[0] ? db.select().from(refunds).where(eq(refunds.id, outcome.refundIds[0])).get() : undefined;
    const method = firstRefund ? db.select().from(payments).where(eq(payments.id, firstRefund.paymentId)).get()!.method : null;
    mailed = await trySend(
      cancellationMail({
        email: person.email!,
        firstName: person.firstName,
        lastName: person.lastName,
        locale: person.locale,
        eventName: event.name,
        refundCents: outcome.amounts.refundCents,
        refundStatus: outcome.refundStatus,
        refundMethod: method,
        paidCents: paidBefore,
        openCents: outcome.amounts.openCents,
        invoiceNumber: invoice?.number ?? null,
        creditNote: credit ? { number: credit.number, attachment: credit.attachment } : null,
        bank: invoice?.organizer.iban ? { holder: invoice.organizer.name, iban: invoice.organizer.iban, bic: invoice.organizer.bic ?? null } : null,
        organizer: mailOrganizer(db),
      }),
      options.mailer ?? getMailer()
    );
    if (mailed && credit) markInvoiceSent(db, credit.invoice.id, now);
    writeAudit(db, actor, {
      action: mailed ? 'mail.sent' : 'mail.failed',
      entity: 'registration',
      entityId: registrationId,
      eventId: event.id,
      summary: `Stornobestätigung ${mailed ? 'versendet' : 'nicht versendet (Fehler)'}`,
    });
  }

  let failedRefunds = 0;
  for (const id of outcome.executeIds) {
    const r = await executeRefundAndNotify(db, actor, id, options);
    if (r.status === 'failed') failedRefunds++;
  }
  return { ...outcome, mailed, failedRefunds };
}
