/**
 * Inhalt eines Belegs (Rechnung/Gutschrift) als fertig formatierte Texte in der Sprache des Belegs.
 * Enthält alle Pflichtangaben nach § 11 UStG; das PDF-Layout (./pdf.ts) setzt nur noch Texte.
 */
import { formatDateOnly, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import type { InvoiceItem, InvoiceParty } from '@/server/db/schema';

export type InvoiceDocumentSource = {
  type: 'invoice' | 'credit_note';
  number: string;
  locale: 'de' | 'en';
  issuedAt: string;
  serviceDate: string;
  dueAt: string | null;
  recipient: InvoiceParty;
  organizer: InvoiceParty;
  items: InvoiceItem[];
  vatMode: 'small_business' | 'standard';
  netCents: number;
  vatCents: number;
  grossCents: number;
  note: string | null;
};

export type InvoiceDocument = {
  title: string;
  senderLine: string;
  seller: string[];
  recipient: string[];
  meta: [string, string][];
  columns: { pos: string; description: string; quantity: string; vat: string; amount: string };
  rows: { pos: string; description: string; quantity: string; vat: string; amount: string }[];
  totals: [string, string][];
  notes: string[];
  footer: string;
  fileName: string;
};

const L = {
  de: {
    invoice: 'Rechnung',
    credit_note: 'Gutschrift',
    number: { invoice: 'Rechnungsnummer', credit_note: 'Gutschriftsnummer' },
    date: { invoice: 'Rechnungsdatum', credit_note: 'Datum' },
    serviceDate: 'Leistungsdatum',
    servicePeriod: 'Leistungszeitraum',
    due: 'Zahlbar bis',
    related: 'Zu Rechnung',
    vatIdSeller: 'UID',
    vatIdRecipient: 'UID',
    pos: 'Pos.',
    description: 'Beschreibung',
    quantity: 'Menge',
    vat: 'USt',
    amount: 'Betrag',
    net: 'Nettobetrag',
    vatAmount: (rate: string) => `USt ${rate}`,
    total: 'Gesamtbetrag',
    totalCredit: 'Gutschriftsbetrag',
    paid: 'Der Rechnungsbetrag wurde bereits beglichen. Vielen Dank!',
    payBy: (amount: string, due: string, number: string) => `Bitte überweisen Sie ${amount} bis ${due} unter Angabe der Rechnungsnummer ${number}.`,
    bank: (iban: string, bic: string | null) => `IBAN ${iban}${bic ? ` · BIC ${bic}` : ''}`,
    credit: (number: string) => `Diese Gutschrift bezieht sich auf die Rechnung ${number}.`,
    reason: 'Grund',
    attn: 'z. H.',
    fileName: { invoice: 'Rechnung', credit_note: 'Gutschrift' },
  },
  en: {
    invoice: 'Invoice',
    credit_note: 'Credit note',
    number: { invoice: 'Invoice number', credit_note: 'Credit note number' },
    date: { invoice: 'Invoice date', credit_note: 'Date' },
    serviceDate: 'Date of service',
    servicePeriod: 'Service period',
    due: 'Due date',
    related: 'Relates to invoice',
    vatIdSeller: 'VAT ID',
    vatIdRecipient: 'VAT ID',
    pos: 'No.',
    description: 'Description',
    quantity: 'Qty',
    vat: 'VAT',
    amount: 'Amount',
    net: 'Net amount',
    vatAmount: (rate: string) => `VAT ${rate}`,
    total: 'Total',
    totalCredit: 'Credit amount',
    paid: 'This invoice has already been paid. Thank you!',
    payBy: (amount: string, due: string, number: string) => `Please transfer ${amount} by ${due}, quoting invoice number ${number}.`,
    bank: (iban: string, bic: string | null) => `IBAN ${iban}${bic ? ` · BIC ${bic}` : ''}`,
    credit: (number: string) => `This credit note relates to invoice ${number}.`,
    reason: 'Reason',
    attn: 'Attn.',
    fileName: { invoice: 'Invoice', credit_note: 'Credit-note' },
  },
} as const;

export function formatRate(bp: number, locale: 'de' | 'en'): string {
  const pct = bp / 100;
  return `${new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'de-AT', { maximumFractionDigits: 2 }).format(pct)} %`;
}

function formatServiceDate(value: string, locale: 'de' | 'en'): string {
  const [from, to] = value.split('/');
  return to ? `${formatDateOnly(from, locale)} – ${formatDateOnly(to, locale)}` : formatDateOnly(from, locale);
}

const lines = (text: string | null | undefined) =>
  (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export function invoiceFileName(type: 'invoice' | 'credit_note', number: string, locale: 'de' | 'en'): string {
  return `${L[locale].fileName[type]}-${number}.pdf`;
}

export function buildInvoiceDocument(src: InvoiceDocumentSource, relatedNumber: string | null = null): InvoiceDocument {
  const l = L[src.locale];
  const money = (c: number) => formatEuro(c, src.locale);
  const org = src.organizer;
  const rec = src.recipient;
  const small = src.vatMode === 'small_business';

  const seller = [org.name, ...lines(org.address)];
  if (org.vatId) seller.push(`${l.vatIdSeller}: ${org.vatId}`);
  if (org.email) seller.push(org.email);

  const recipient: string[] = [];
  if (rec.company) recipient.push(rec.company);
  if (rec.name && rec.name !== rec.company) recipient.push(rec.company ? `${l.attn} ${rec.name}` : rec.name);
  recipient.push(...lines(rec.address));
  if (rec.vatId) recipient.push(`${l.vatIdRecipient}: ${rec.vatId}`);

  const meta: [string, string][] = [
    [l.number[src.type], src.number],
    [l.date[src.type], formatDateOnly(viennaDate(src.issuedAt), src.locale)],
    [src.serviceDate.includes('/') ? l.servicePeriod : l.serviceDate, formatServiceDate(src.serviceDate, src.locale)],
  ];
  if (src.type === 'credit_note' && relatedNumber) meta.push([l.related, relatedNumber]);
  if (src.type === 'invoice' && src.dueAt) meta.push([l.due, formatDateOnly(src.dueAt, src.locale)]);

  const rows = src.items.map((item, i) => ({
    pos: String(i + 1),
    description: item.description,
    quantity: String(item.quantity),
    vat: small ? '–' : formatRate(item.vatRateBp, src.locale),
    amount: money(item.grossCents),
  }));

  const totals: [string, string][] = [];
  if (!small) {
    totals.push([l.net, money(src.netCents)]);
    const byRate = new Map<number, number>();
    for (const i of src.items) byRate.set(i.vatRateBp, (byRate.get(i.vatRateBp) ?? 0) + i.vatCents);
    for (const [rate, cents] of [...byRate.entries()].sort((a, b) => b[0] - a[0])) totals.push([l.vatAmount(formatRate(rate, src.locale)), money(cents)]);
  }
  totals.push([src.type === 'credit_note' ? l.totalCredit : l.total, money(src.grossCents)]);

  const notes: string[] = [];
  if (small) notes.push(localized(org.smallBusinessNote ?? null, src.locale) || (src.locale === 'en' ? 'VAT exempt under the small business scheme.' : 'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung.'));
  if (src.type === 'credit_note') {
    if (relatedNumber) notes.push(l.credit(relatedNumber));
    if (src.note) notes.push(`${l.reason}: ${src.note}`);
  } else {
    if (src.dueAt) {
      notes.push(l.payBy(money(src.grossCents), formatDateOnly(src.dueAt, src.locale), src.number));
      if (org.iban) notes.push(`${org.name} · ${l.bank(org.iban, org.bic ?? null)}`);
    } else {
      notes.push(l.paid);
    }
    if (src.note) notes.push(src.note);
  }

  const footer = [org.name, lines(org.address).join(', '), org.vatId ? `${l.vatIdSeller} ${org.vatId}` : null, org.iban ? l.bank(org.iban, org.bic ?? null) : null, org.email]
    .filter(Boolean)
    .join(' · ');

  return {
    title: l[src.type],
    senderLine: [org.name, lines(org.address).join(', ')].filter(Boolean).join(' · '),
    seller,
    recipient,
    meta,
    columns: { pos: l.pos, description: l.description, quantity: l.quantity, vat: l.vat, amount: l.amount },
    rows,
    totals,
    notes,
    footer,
    fileName: invoiceFileName(src.type, src.number, src.locale),
  };
}
