/**
 * E-Mails rund um Anmeldung und Belege: Bestätigung (mit Rechnung im Anhang), Wartelisten-Bestätigung,
 * Versand von Rechnungen/Gutschriften und Zahlungserinnerungen.
 *
 * Versandfehler brechen fachliche Abläufe nie ab (die Anmeldung/Zahlung ist bereits gespeichert); sie werden
 * im Protokoll vermerkt. Personen mit eingeschränkter Verarbeitung erhalten keine E-Mails.
 */
import { eq } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { Db } from '@/server/db/core';
import { events, people, registrations, type InvoiceParty } from '@/server/db/schema';
import { invoicePdf } from '@/server/invoices/storage';
import { getMailer, trySend, type Mailer } from '@/server/mail';
import { confirmationMail, documentMail, reminderMail, type BankDetails, type MailOrganizer } from '@/server/mail/templates';
import { SYSTEM, writeAudit, type Actor } from './audit';
import {
  activeInvoiceOf,
  claimReminder,
  eventIdOfInvoice,
  findDueReminders,
  getInvoice,
  invoiceRecipient,
  issueRegistrationInvoice,
  markInvoiceSent,
  paidRegistrationsWithoutInvoice,
  recordReminderAudit,
  releaseReminder,
  type InvoiceRow,
} from './invoices';
import { getOrganizerSettings } from './organizer';

export function mailOrganizer(db: Db): MailOrganizer {
  const org = getOrganizerSettings(db);
  return { name: org.name.trim() || null, email: org.contactEmail?.trim() || null };
}

function bankOf(party: InvoiceParty): BankDetails | null {
  return party.iban ? { holder: party.name, iban: party.iban, bic: party.bic ?? null } : null;
}

function eventOfInvoice(db: Db, invoice: InvoiceRow) {
  return db.select().from(events).where(eq(events.id, eventIdOfInvoice(db, invoice))).get()!;
}

async function attachmentOf(db: Db, invoice: InvoiceRow) {
  const pdf = await invoicePdf(db, invoice);
  return { filename: pdf.fileName, content: pdf.content, contentType: 'application/pdf' };
}

/** Rechnung oder Gutschrift per E-Mail senden (Admin-Aktion „Senden“ bzw. „Erneut senden“). */
export async function sendInvoiceDocument(db: Db, actor: Actor, invoiceId: number, mailer: Mailer = getMailer(), now = new Date()): Promise<void> {
  const invoice = getInvoice(db, invoiceId);
  if (!invoice) throw new ServiceError('NOT_FOUND');
  const to = invoiceRecipient(db, invoice);
  if (!to) throw new ServiceError('CONFLICT', { _form: 'noRecipientEmail' });
  const event = eventOfInvoice(db, invoice);
  const related = invoice.relatedInvoiceId ? getInvoice(db, invoice.relatedInvoiceId)?.number ?? null : null;
  const message = documentMail({
    ...to,
    type: invoice.type,
    number: invoice.number,
    relatedNumber: related,
    grossCents: invoice.grossCents,
    dueAt: invoice.dueAt,
    eventName: event.name,
    bank: bankOf(invoice.organizer),
    attachment: await attachmentOf(db, invoice),
    organizer: mailOrganizer(db),
  });
  if (!(await trySend(message, mailer))) throw new ServiceError('CONFLICT', { _form: 'mailFailed' });
  markInvoiceSent(db, invoice.id, now);
  writeAudit(db, actor, {
    action: 'invoice.sent',
    entity: 'invoice',
    entityId: invoice.id,
    eventId: event.id,
    summary: `${invoice.type === 'credit_note' ? 'Gutschrift' : 'Rechnung'} ${invoice.number} per E-Mail versendet`,
  });
}

export type NotifyOutcome = { invoiceId: number | null; mailed: boolean };

/**
 * Nach einer Anmeldung bzw. Bestätigung: bei Bedarf Rechnung ausstellen und die Bestätigung (bzw.
 * Wartelisten-Bestätigung) in der Sprache der Person senden – die Rechnung als PDF im Anhang.
 */
export async function notifyRegistration(
  db: Db,
  registrationId: number,
  options: { actor?: Actor; mailer?: Mailer; issueInvoice?: boolean; now?: Date } = {}
): Promise<NotifyOutcome> {
  const actor = options.actor ?? SYSTEM;
  const now = options.now ?? new Date();
  const row = db
    .select({ reg: registrations, person: people, event: events })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.id, registrationId))
    .get();
  if (!row) return { invoiceId: null, mailed: false };
  const { reg, person, event } = row;
  if (reg.status !== 'confirmed' && reg.status !== 'waitlisted') return { invoiceId: null, mailed: false };

  let invoice: InvoiceRow | undefined;
  if (reg.status === 'confirmed' && reg.paymentMethod !== 'free' && reg.priceCents > 0) {
    invoice = activeInvoiceOf(db, { registrationId });
    if (!invoice && options.issueInvoice !== false) {
      try {
        invoice = issueRegistrationInvoice(db, actor, registrationId, now);
      } catch (error) {
        const code = error instanceof ServiceError ? (error.fieldErrors?._form ?? error.code) : 'UNEXPECTED';
        console.error('[invoice] Ausstellung fehlgeschlagen', code);
        writeAudit(db, actor, { action: 'invoice.failed', entity: 'registration', entityId: registrationId, eventId: event.id, summary: `Rechnung konnte nicht ausgestellt werden (${code})` });
      }
    }
  }

  if (!person.email || person.restrictedAt || person.anonymizedAt) return { invoiceId: invoice?.id ?? null, mailed: false };

  const message = confirmationMail({
    email: person.email,
    firstName: person.firstName,
    lastName: person.lastName,
    locale: person.locale,
    eventName: event.name,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    status: reg.status,
    paymentMethod: reg.paymentMethod,
    paid: reg.paymentStatus === 'paid',
    priceCents: reg.priceCents,
    invoice: invoice ? { number: invoice.number, grossCents: invoice.grossCents, dueAt: invoice.dueAt, attachment: await attachmentOf(db, invoice) } : null,
    bank: invoice ? bankOf(invoice.organizer) : null,
    organizer: mailOrganizer(db),
  });
  const mailed = await trySend(message, options.mailer ?? getMailer());
  if (mailed && invoice) markInvoiceSent(db, invoice.id, now);
  writeAudit(db, actor, {
    action: mailed ? 'mail.sent' : 'mail.failed',
    entity: 'registration',
    entityId: registrationId,
    eventId: event.id,
    summary: `${reg.status === 'waitlisted' ? 'Wartelisten-Bestätigung' : 'Anmeldebestätigung'}${invoice ? ` mit Rechnung ${invoice.number}` : ''} ${mailed ? 'versendet' : 'nicht versendet (Fehler)'}`,
  });
  return { invoiceId: invoice?.id ?? null, mailed };
}

/** Wie {@link notifyRegistration}, aber ohne dass ein Fehler den Aufrufer (Webhook, Action) stört. */
export async function notifyRegistrationSafely(db: Db, registrationId: number, options: Parameters<typeof notifyRegistration>[2] = {}): Promise<void> {
  try {
    await notifyRegistration(db, registrationId, options);
  } catch (error) {
    console.error('[mail] Bestätigung fehlgeschlagen', error instanceof Error ? error.message : error);
  }
}

export type ReminderSummary = { sent: number; failed: number; skipped: number };

/** Zeitplan: fällige Zahlungserinnerungen senden (Rechnung erneut im Anhang). */
export async function sendDueReminders(db: Db, mailer: Mailer = getMailer(), now = new Date()): Promise<ReminderSummary> {
  const summary: ReminderSummary = { sent: 0, failed: 0, skipped: 0 };
  const organizer = mailOrganizer(db);
  for (const { invoice, level, openCents } of findDueReminders(db, now)) {
    const to = invoiceRecipient(db, invoice);
    if (!to || !invoice.dueAt) {
      summary.skipped++;
      continue;
    }
    if (!claimReminder(db, invoice.id, level, now)) continue;
    try {
      const message = reminderMail({
        ...to,
        level,
        number: invoice.number,
        issuedAt: invoice.issuedAt,
        dueAt: invoice.dueAt,
        openCents,
        eventName: eventOfInvoice(db, invoice).name,
        bank: bankOf(invoice.organizer),
        attachment: await attachmentOf(db, invoice),
        organizer,
      });
      if (await trySend(message, mailer)) {
        recordReminderAudit(db, invoice, level);
        summary.sent++;
        continue;
      }
    } catch (error) {
      console.error('[reminder] Fehler', error instanceof Error ? error.message : error);
    }
    releaseReminder(db, invoice.id, level);
    summary.failed++;
  }
  return summary;
}

/** Zeitplan: Rechnungen zu online bezahlten Anmeldungen nachholen, falls die Ausstellung nach der Zahlung scheiterte. */
export async function issueMissingInvoices(db: Db, mailer: Mailer = getMailer(), now = new Date()): Promise<number> {
  let issued = 0;
  for (const id of paidRegistrationsWithoutInvoice(db, new Date(now.getTime() - 10 * 60_000))) {
    try {
      const invoice = issueRegistrationInvoice(db, SYSTEM, id, now);
      issued++;
      await sendInvoiceDocument(db, SYSTEM, invoice.id, mailer, now).catch(() => undefined);
    } catch (error) {
      if (!(error instanceof ServiceError)) console.error('[invoice] Nachholen fehlgeschlagen', error instanceof Error ? error.message : error);
    }
  }
  return issued;
}


