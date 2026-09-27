/**
 * Textvorlagen für System-E-Mails (de/en). Jede E-Mail endet mit Veranstalter, Kontakt und dem Link zur
 * Datenschutzerklärung (Spezifikation 7.1). Nur reiner Text – robust in allen Mailprogrammen.
 */
import { formatDateOnly, TIME_ZONE } from '@/lib/dates';
import { localized, type LocalizedText } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { appBaseUrl } from '@/server/payments/config';
import type { MailAttachment, MailMessage } from './index';

type Locale = 'de' | 'en';

export type MailOrganizer = { name: string | null; email: string | null };
export type BankDetails = { holder: string; iban: string; bic: string | null };

const intl = (locale: Locale) => (locale === 'en' ? 'en-GB' : 'de-AT');

const when = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(intl(locale), { dateStyle: 'full', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(iso));

/** Zeitraum eines Events, z. B. „Mittwoch, 12. Mai 2027, 08:00–18:00“. */
export function eventWhen(startsAt: string, endsAt: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intl(locale), { dateStyle: 'full', timeStyle: 'short', timeZone: TIME_ZONE }).formatRange(new Date(startsAt), new Date(endsAt));
}

const priceText = (cents: number, locale: Locale) => (cents === 0 ? (locale === 'en' ? 'free' : 'kostenlos') : formatEuro(cents, locale));

function footer(locale: Locale, organizer: MailOrganizer | null | undefined): string[] {
  const privacy = `${appBaseUrl()}/${locale}/privacy`;
  return ['', '--', organizer?.name, organizer?.email, `${locale === 'en' ? 'Privacy notice' : 'Datenschutzerklärung'}: ${privacy}`].filter(
    (l): l is string => typeof l === 'string'
  );
}

function bankLines(bank: BankDetails | null | undefined, locale: Locale): string[] {
  if (!bank) return [];
  return [
    `${locale === 'en' ? 'Account holder' : 'Kontoinhaber'}: ${bank.holder}`,
    `IBAN: ${bank.iban}${bank.bic ? ` · BIC: ${bank.bic}` : ''}`,
  ];
}

function greeting(locale: Locale, firstName: string, lastName: string): string {
  const name = `${firstName} ${lastName}`.trim();
  if (locale === 'en') return name ? `Dear ${name},` : 'Hello,';
  return name ? `Guten Tag ${name},` : 'Guten Tag,';
}

function mail(to: string, subject: string, body: (string | null | false | undefined)[], locale: Locale, organizer: MailOrganizer | null | undefined, attachments?: MailAttachment[]): MailMessage {
  return {
    to,
    subject,
    text: [...body.filter((l): l is string => typeof l === 'string'), ...footer(locale, organizer)].join('\n'),
    replyTo: organizer?.email ?? null,
    attachments: attachments?.length ? attachments : undefined,
  };
}

// ---------------------------------------------------------------------------
// Warteliste: Angebot eines frei gewordenen Platzes
// ---------------------------------------------------------------------------

export type OfferMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: Locale;
  eventName: LocalizedText;
  token: string;
  expiresAt: string;
  priceCents: number;
  organizer?: MailOrganizer | null;
};

export function waitlistOfferMail(d: OfferMailData): MailMessage {
  const event = localized(d.eventName, d.locale);
  const link = `${appBaseUrl()}/${d.locale}/offer/${d.token}`;
  const price = priceText(d.priceCents, d.locale);
  if (d.locale === 'en') {
    return mail(
      d.email,
      `A seat is available: ${event}`,
      [
        greeting('en', d.firstName, d.lastName),
        '',
        `a seat has become available for ${event}. You were next on the waitlist.`,
        `Price: ${price}`,
        '',
        `Accept the seat here (valid until ${when(d.expiresAt, 'en')}):`,
        link,
        '',
        'If you do not accept it in time, the seat will be offered to the next person.',
      ],
      'en',
      d.organizer
    );
  }
  return mail(
    d.email,
    `Ein Platz ist frei: ${event}`,
    [
      greeting('de', d.firstName, d.lastName),
      '',
      `für ${event} ist ein Platz frei geworden. Sie sind als Nächste:r auf der Warteliste.`,
      `Preis: ${price}`,
      '',
      `Hier können Sie den Platz annehmen (gültig bis ${when(d.expiresAt, 'de')}):`,
      link,
      '',
      'Nehmen Sie das Angebot nicht rechtzeitig an, geht der Platz an die nächste Person.',
    ],
    'de',
    d.organizer
  );
}

// ---------------------------------------------------------------------------
// Anmeldebestätigung und Wartelisten-Bestätigung
// ---------------------------------------------------------------------------

export type InvoiceMailInfo = { number: string; grossCents: number; dueAt: string | null; attachment: MailAttachment };

export type ConfirmationMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: Locale;
  eventName: LocalizedText;
  startsAt: string;
  endsAt: string;
  location: string;
  status: 'confirmed' | 'waitlisted';
  paymentMethod: 'stripe' | 'invoice' | 'free';
  paid: boolean;
  priceCents: number;
  invoice: InvoiceMailInfo | null;
  bank: BankDetails | null;
  organizer: MailOrganizer | null;
};

export function confirmationMail(d: ConfirmationMailData): MailMessage {
  const en = d.locale === 'en';
  const event = localized(d.eventName, d.locale);
  const details = [
    `${en ? 'When' : 'Wann'}: ${eventWhen(d.startsAt, d.endsAt, d.locale)}`,
    d.location.trim() ? `${en ? 'Where' : 'Wo'}: ${d.location.trim()}` : null,
    `${en ? 'Price' : 'Preis'}: ${priceText(d.priceCents, d.locale)}`,
  ];

  if (d.status === 'waitlisted') {
    return mail(
      d.email,
      en ? `You are on the waitlist: ${event}` : `Sie stehen auf der Warteliste: ${event}`,
      [
        greeting(d.locale, d.firstName, d.lastName),
        '',
        en
          ? `thank you for registering for ${event}. The event is currently fully booked, so we have put you on the waitlist.`
          : `vielen Dank für Ihre Anmeldung zu ${event}. Das Event ist derzeit ausgebucht, daher stehen Sie auf der Warteliste.`,
        en
          ? 'As soon as a seat becomes available, you will receive an offer by e-mail that is valid for 48 hours.'
          : 'Sobald ein Platz frei wird, erhalten Sie ein Angebot per E-Mail, das 48 Stunden gültig ist.',
        '',
        ...details,
      ],
      d.locale,
      d.organizer
    );
  }

  const payment: (string | null)[] = [];
  if (d.paymentMethod === 'invoice' && !d.paid) {
    if (d.invoice) {
      payment.push(
        en
          ? `Please find invoice ${d.invoice.number} attached. Please transfer ${formatEuro(d.invoice.grossCents, 'en')}${d.invoice.dueAt ? ` by ${formatDateOnly(d.invoice.dueAt, 'en')}` : ''}, quoting the invoice number.`
          : `Im Anhang finden Sie die Rechnung ${d.invoice.number}. Bitte überweisen Sie ${formatEuro(d.invoice.grossCents, 'de')}${d.invoice.dueAt ? ` bis ${formatDateOnly(d.invoice.dueAt, 'de')}` : ''} unter Angabe der Rechnungsnummer.`,
        ...bankLines(d.bank, d.locale)
      );
    } else {
      payment.push(en ? 'You will receive the invoice in a separate e-mail.' : 'Die Rechnung erhalten Sie mit einer gesonderten E-Mail.');
    }
  } else if (d.paid) {
    payment.push(en ? 'We have received your payment – thank you.' : 'Ihre Zahlung ist bei uns eingegangen – vielen Dank.');
    if (d.invoice) payment.push(en ? `Please find invoice ${d.invoice.number} attached.` : `Im Anhang finden Sie die Rechnung ${d.invoice.number}.`);
  }

  return mail(
    d.email,
    en ? `Registration confirmed: ${event}` : `Anmeldung bestätigt: ${event}`,
    [
      greeting(d.locale, d.firstName, d.lastName),
      '',
      en ? `thank you for registering. Your place at ${event} is confirmed.` : `vielen Dank für Ihre Anmeldung. Ihre Teilnahme an ${event} ist bestätigt.`,
      '',
      ...details,
      ...(payment.length ? ['', ...payment] : []),
      '',
      en ? 'We look forward to seeing you!' : 'Wir freuen uns auf Sie!',
    ],
    d.locale,
    d.organizer,
    d.invoice ? [d.invoice.attachment] : undefined
  );
}

// ---------------------------------------------------------------------------
// Rechnung / Gutschrift (Versand und erneuter Versand)
// ---------------------------------------------------------------------------

export type DocumentMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: Locale;
  type: 'invoice' | 'credit_note';
  number: string;
  relatedNumber: string | null;
  grossCents: number;
  dueAt: string | null;
  eventName: LocalizedText;
  bank: BankDetails | null;
  attachment: MailAttachment;
  organizer: MailOrganizer | null;
};

export function documentMail(d: DocumentMailData): MailMessage {
  const en = d.locale === 'en';
  const event = localized(d.eventName, d.locale);
  const amount = formatEuro(d.grossCents, d.locale);
  if (d.type === 'credit_note') {
    return mail(
      d.email,
      en ? `Credit note ${d.number} – ${event}` : `Gutschrift ${d.number} – ${event}`,
      [
        greeting(d.locale, d.firstName, d.lastName),
        '',
        en
          ? `please find attached credit note ${d.number}${d.relatedNumber ? ` for invoice ${d.relatedNumber}` : ''} over ${amount}.`
          : `im Anhang erhalten Sie die Gutschrift ${d.number}${d.relatedNumber ? ` zur Rechnung ${d.relatedNumber}` : ''} über ${amount}.`,
      ],
      d.locale,
      d.organizer,
      [d.attachment]
    );
  }
  return mail(
    d.email,
    en ? `Invoice ${d.number} – ${event}` : `Rechnung ${d.number} – ${event}`,
    [
      greeting(d.locale, d.firstName, d.lastName),
      '',
      en ? `please find attached invoice ${d.number} over ${amount}.` : `im Anhang erhalten Sie die Rechnung ${d.number} über ${amount}.`,
      ...(d.dueAt
        ? [
            en
              ? `Please transfer the amount by ${formatDateOnly(d.dueAt, 'en')}, quoting the invoice number.`
              : `Bitte überweisen Sie den Betrag bis ${formatDateOnly(d.dueAt, 'de')} unter Angabe der Rechnungsnummer.`,
            ...bankLines(d.bank, d.locale),
          ]
        : [en ? 'The invoice has already been paid – thank you.' : 'Die Rechnung ist bereits bezahlt – vielen Dank.']),
    ],
    d.locale,
    d.organizer,
    [d.attachment]
  );
}

// ---------------------------------------------------------------------------
// Zahlungserinnerung
// ---------------------------------------------------------------------------

export type ReminderMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: Locale;
  level: number;
  number: string;
  issuedAt: string;
  dueAt: string;
  openCents: number;
  eventName: LocalizedText;
  bank: BankDetails | null;
  attachment: MailAttachment;
  organizer: MailOrganizer | null;
};

export function reminderMail(d: ReminderMailData): MailMessage {
  const en = d.locale === 'en';
  const event = localized(d.eventName, d.locale);
  const amount = formatEuro(d.openCents, d.locale);
  const due = formatDateOnly(d.dueAt, d.locale);
  const ordinal = (n: number) => `${n}${n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
  const prefix = d.level > 1 ? (en ? `${ordinal(d.level)} payment reminder` : `${d.level}. Zahlungserinnerung`) : en ? 'Payment reminder' : 'Zahlungserinnerung';
  return mail(
    d.email,
    `${prefix}: ${en ? 'invoice' : 'Rechnung'} ${d.number} – ${event}`,
    [
      greeting(d.locale, d.firstName, d.lastName),
      '',
      en
        ? `according to our records, invoice ${d.number} (due on ${due}) has not yet been paid in full. The outstanding amount is ${amount}.`
        : `laut unseren Unterlagen ist die Rechnung ${d.number} (fällig am ${due}) noch nicht vollständig bezahlt. Offen sind ${amount}.`,
      en ? 'Please transfer the amount quoting the invoice number:' : 'Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer:',
      ...bankLines(d.bank, d.locale),
      '',
      en
        ? 'If you have already paid, please disregard this e-mail. The invoice is attached again for your convenience.'
        : 'Sollten Sie bereits bezahlt haben, betrachten Sie diese E-Mail bitte als gegenstandslos. Die Rechnung liegt nochmals bei.',
    ],
    d.locale,
    d.organizer,
    [d.attachment]
  );
}

// ---------------------------------------------------------------------------
// Stornobestätigung und Erstattung
// ---------------------------------------------------------------------------

export type CancellationMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: Locale;
  eventName: LocalizedText;
  refundCents: number;
  refundStatus: 'none' | 'proposed' | 'approved';
  refundMethod: 'stripe' | 'bank_transfer' | null;
  /** bezahlter Betrag vor dem Storno (0 = nichts bezahlt) */
  paidCents: number;
  openCents: number;
  invoiceNumber: string | null;
  creditNote: { number: string; attachment: MailAttachment } | null;
  bank: BankDetails | null;
  organizer: MailOrganizer | null;
};

export function cancellationMail(d: CancellationMailData): MailMessage {
  const en = d.locale === 'en';
  const event = localized(d.eventName, d.locale);
  const money = (c: number) => formatEuro(c, d.locale);
  const lines: string[] = [];
  if (d.refundCents > 0) {
    if (d.refundStatus === 'proposed') {
      lines.push(en ? `A refund of ${money(d.refundCents)} is being reviewed. We will let you know once it has been processed.` : `Eine Erstattung von ${money(d.refundCents)} wird geprüft. Sie erhalten Bescheid, sobald sie durchgeführt ist.`);
    } else if (d.refundMethod === 'bank_transfer') {
      lines.push(
        en
          ? `We will transfer ${money(d.refundCents)} back to you. If we do not have your bank details yet, please reply to this e-mail with them.`
          : `Wir überweisen Ihnen ${money(d.refundCents)} zurück. Falls uns Ihre Bankverbindung noch nicht vorliegt, antworten Sie bitte mit Ihrer IBAN auf diese E-Mail.`
      );
    } else {
      lines.push(en ? `We will refund ${money(d.refundCents)} to your original payment method.` : `Wir erstatten ${money(d.refundCents)} auf das ursprünglich verwendete Zahlungsmittel.`);
    }
    lines.push(en ? 'You will receive a credit note by e-mail once the refund has been made.' : 'Sobald die Erstattung durchgeführt ist, erhalten Sie eine Gutschrift per E-Mail.');
  } else if (d.paidCents > 0) {
    lines.push(en ? 'According to the cancellation terms, no refund is due.' : 'Laut Stornobedingungen ist keine Erstattung vorgesehen.');
  }
  if (d.creditNote) {
    lines.push(
      en
        ? `Please find credit note ${d.creditNote.number}${d.invoiceNumber ? ` for invoice ${d.invoiceNumber}` : ''} attached.`
        : `Im Anhang finden Sie die Gutschrift ${d.creditNote.number}${d.invoiceNumber ? ` zur Rechnung ${d.invoiceNumber}` : ''}.`
    );
  }
  if (d.openCents > 0) {
    lines.push(
      en
        ? `According to the cancellation terms, a cancellation fee of ${money(d.openCents)} remains payable${d.invoiceNumber ? ` (invoice ${d.invoiceNumber})` : ''}.`
        : `Laut Stornobedingungen bleibt eine Stornogebühr von ${money(d.openCents)} zu bezahlen${d.invoiceNumber ? ` (Rechnung ${d.invoiceNumber})` : ''}.`,
      ...bankLines(d.bank, d.locale)
    );
  }
  return mail(
    d.email,
    en ? `Cancellation confirmed: ${event}` : `Stornierung bestätigt: ${event}`,
    [
      greeting(d.locale, d.firstName, d.lastName),
      '',
      en ? `your registration for ${event} has been cancelled.` : `Ihre Anmeldung zu ${event} wurde storniert.`,
      ...(lines.length ? ['', ...lines] : []),
    ],
    d.locale,
    d.organizer,
    d.creditNote ? [d.creditNote.attachment] : undefined
  );
}

export type RefundMailData = {
  email: string;
  firstName: string;
  lastName: string;
  locale: Locale;
  eventName: LocalizedText;
  amountCents: number;
  method: 'stripe' | 'bank_transfer';
  creditNote: { number: string; attachment: MailAttachment } | null;
  organizer: MailOrganizer | null;
};

export function refundMail(d: RefundMailData): MailMessage {
  const en = d.locale === 'en';
  const event = localized(d.eventName, d.locale);
  const amount = formatEuro(d.amountCents, d.locale);
  return mail(
    d.email,
    en ? `Refund of ${amount}: ${event}` : `Erstattung über ${amount}: ${event}`,
    [
      greeting(d.locale, d.firstName, d.lastName),
      '',
      d.method === 'stripe'
        ? en
          ? `we have refunded ${amount} to your original payment method. Depending on your bank, it may take a few days to appear.`
          : `wir haben ${amount} auf das ursprünglich verwendete Zahlungsmittel erstattet. Je nach Bank kann die Gutschrift einige Tage dauern.`
        : en
          ? `we have transferred ${amount} to your account.`
          : `wir haben Ihnen ${amount} überwiesen.`,
      d.creditNote ? (en ? `Please find credit note ${d.creditNote.number} attached.` : `Im Anhang finden Sie die Gutschrift ${d.creditNote.number}.`) : null,
    ],
    d.locale,
    d.organizer,
    d.creditNote ? [d.creditNote.attachment] : undefined
  );
}
