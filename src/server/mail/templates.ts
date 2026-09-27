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
