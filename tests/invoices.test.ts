import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, invoices, paymentReminders, registrations, sponsors } from '@/server/db/schema';
import { buildInvoiceDocument } from '@/server/invoices/document';
import { renderInvoicePdf } from '@/server/invoices/pdf';
import { invoicePdf } from '@/server/invoices/storage';
import type { MailMessage } from '@/server/mail';
import { resetRateLimits } from '@/server/rate-limit';
import { runJobs } from '@/server/services/automation';
import { createEvent } from '@/server/services/events';
import {
  activeInvoiceOf,
  cancelInvoice,
  findDueReminders,
  formatInvoiceNumber,
  issueCreditNote,
  issueRegistrationInvoice,
  issueSponsorInvoice,
  listInvoices,
  markOverdueSponsors,
  recordBankTransfer,
} from '@/server/services/invoices';
import { publishLegalVersion } from '@/server/services/legal';
import { notifyRegistration, sendDueReminders } from '@/server/services/notifications';
import { saveOrganizerSettings, type OrganizerInput } from '@/server/services/organizer';
import { registerPublic } from '@/server/services/public-registration';
import { createPackage, createSponsor } from '@/server/services/sponsors';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-invoices-'));
  process.env.INVOICE_DIR = dir;
});
afterAll(() => {
  delete process.env.INVOICE_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => resetRateLimits());

const organizer = (o: Partial<OrganizerInput> = {}): OrganizerInput => ({
  name: 'Verein Beispiel',
  address: 'Hauptplatz 1\n8010 Graz',
  vatId: null,
  iban: 'AT611904300234573201',
  bic: 'BKAUATWW',
  contactEmail: 'office@verein.example',
  vatMode: 'small_business',
  smallBusinessNote: { de: 'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung.', en: 'VAT exempt (small business).' },
  invoicePaymentTermDays: 14,
  ...o,
});

function capture() {
  const sent: MailMessage[] = [];
  return { sent, mailer: async (m: MailMessage) => void sent.push(m) };
}

function setup(options: { organizer?: Partial<OrganizerInput> | null; capacity?: number } = {}) {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  if (options.organizer !== null) saveOrganizerSettings(db, actor, organizer(options.organizer ?? {}));
  const event = createEvent(db, actor, {
    slug: 'summit',
    name: { de: 'Summit', en: 'Summit EN' },
    description: null,
    location: 'Graz',
    startsAt: '2027-05-12T06:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: options.capacity ?? 10,
    priceNormalCents: 20000,
    priceMemberCents: 15000,
    ticketVatRateBp: 2000,
    allowStripe: true,
    allowInvoice: true,
    refundMode: 'automatic',
    cancellationRules: [],
  });
  const terms = publishLegalVersion(db, actor, 'terms', event.id, { de: 'AGB' });
  const privacy = publishLegalVersion(db, actor, 'privacy', null, { de: 'DS' });
  const register = (email: string, method: 'invoice' | 'stripe' = 'invoice', locale: 'de' | 'en' = 'de') => {
    const input: PublicRegistrationInput = {
      firstName: 'Eva',
      lastName: 'Muster',
      email,
      company: null,
      locale,
      memberNumber: null,
      paymentMethod: method,
      billingCompany: method === 'invoice' ? 'Firma GmbH' : null,
      billingAddress: method === 'invoice' ? 'Gasse 2\n1010 Wien' : null,
      photoConsent: false,
      newsletter: false,
      termsDocumentId: terms.id,
      privacyDocumentId: privacy.id,
      expectedPriceCents: 20000,
    };
    return registerPublic(db, event.id, input, { stripeEnabled: true, now: NOW }).registrationId;
  };
  const reg = (id: number) => db.select().from(registrations).where(eq(registrations.id, id)).get()!;
  return { db, event, register, reg };
}

function codeOf(fn: () => unknown) {
  try {
    fn();
    return { code: 'OK' };
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
}

describe('Nummernkreis', () => {
  it('fortlaufend je Jahr, gemeinsam für Rechnungen und Gutschriften', () => {
    expect(formatInvoiceNumber(2027, 7)).toBe('2027-0007');
    const { db, register } = setup();
    const a = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    const b = issueRegistrationInvoice(db, actor, register('b@example.org'), NOW);
    const credit = issueCreditNote(db, actor, a.id, { reason: 'Test' }, NOW);
    expect([a.number, b.number, credit.number]).toEqual(['2027-0001', '2027-0002', '2027-0003']);
    // Silvester 23:30 UTC ist in Wien schon Neujahr → neuer Nummernkreis
    const next = issueRegistrationInvoice(db, actor, register('c@example.org'), new Date('2027-12-31T23:30:00.000Z'));
    expect(next.number).toBe('2028-0001');
    expect(next.retainUntil).toBe('2035-12-31');
  });
});

describe('Rechnung zu einer Anmeldung', () => {
  it('Kleinunternehmer: Pflichtangaben als Momentaufnahme, keine USt, Fälligkeit nach Zahlungsziel', () => {
    const { db, register } = setup();
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    expect(inv).toMatchObject({
      type: 'invoice',
      locale: 'de',
      serviceDate: '2027-05-12',
      dueAt: '2027-02-15',
      vatMode: 'small_business',
      netCents: 20000,
      vatCents: 0,
      grossCents: 20000,
      retainUntil: '2034-12-31',
      createdBy: 'admin-1',
    });
    expect(inv.recipient).toEqual({ name: 'Eva Muster', company: 'Firma GmbH', address: 'Gasse 2\n1010 Wien', email: 'a@example.org' });
    expect(inv.organizer).toMatchObject({ name: 'Verein Beispiel', iban: 'AT611904300234573201', smallBusinessNote: { de: 'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung.' } });
    expect(inv.items).toEqual([{ description: 'Summit – Ticket\nGraz', quantity: 1, unitGrossCents: 20000, vatRateBp: 0, netCents: 20000, vatCents: 0, grossCents: 20000 }]);
    expect(db.select().from(auditLog).all().some((a) => a.action === 'invoice.issued' && a.summary.includes('2027-0001'))).toBe(true);
  });

  it('reguläre USt: Netto/USt aus dem Ticket-Steuersatz', () => {
    const { db, register } = setup({ organizer: { vatMode: 'standard', vatId: 'ATU12345678' } });
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    expect(inv).toMatchObject({ vatMode: 'standard', netCents: 16667, vatCents: 3333, grossCents: 20000 });
    expect(inv.items[0].vatRateBp).toBe(2000);
    expect(inv.organizer.smallBusinessNote).toBeNull();
  });

  it('Regeln: keine doppelte Rechnung, nicht für Warteliste, Veranstalterdaten nötig', () => {
    const { db, register } = setup();
    const id = register('a@example.org');
    issueRegistrationInvoice(db, actor, id, NOW);
    expect(codeOf(() => issueRegistrationInvoice(db, actor, id, NOW))).toEqual({ code: 'CONFLICT', fields: { _form: 'invoiceExists' } });

    const bare = setup({ organizer: null });
    expect(codeOf(() => issueRegistrationInvoice(bare.db, actor, bare.register('x@example.org'), NOW))).toEqual({ code: 'CONFLICT', fields: { _form: 'organizerIncomplete' } });
    const std = setup({ organizer: { vatMode: 'standard', vatId: null } });
    expect(codeOf(() => issueRegistrationInvoice(std.db, actor, std.register('x@example.org'), NOW)).fields).toEqual({ _form: 'organizerIncomplete' });

    const full = setup({ capacity: 0 });
    const waiting = full.register('w@example.org');
    expect(full.reg(waiting).status).toBe('waitlisted');
    expect(codeOf(() => issueRegistrationInvoice(full.db, actor, waiting, NOW)).fields).toEqual({ _form: 'invoiceNotPossible' });
  });

  it('nach Online-Zahlung: ohne Fälligkeit (bereits bezahlt)', () => {
    const { db, register, reg } = setup();
    const id = register('p@example.org', 'stripe');
    db.update(registrations).set({ status: 'confirmed', paymentStatus: 'paid' }).where(eq(registrations.id, id)).run();
    expect(reg(id).paymentStatus).toBe('paid');
    expect(issueRegistrationInvoice(db, actor, id, NOW).dueAt).toBeNull();
  });
});

describe('Sponsor-Rechnung', () => {
  it('Paketpreis mit Rabatt als eigener Position, UID, Status „verrechnet“', () => {
    const { db, event } = setup({ organizer: { vatMode: 'standard', vatId: 'ATU12345678' } });
    const pkg = createPackage(db, actor, event.id, { name: { de: 'Gold', en: 'Gold' }, benefits: { de: [] }, priceCents: 600000, vatRateBp: 2000, sortOrder: 1 });
    const contact = { firstName: 'Max', lastName: 'Muster', email: 'max@acme.example', phone: null, function: null, locale: 'en' as const };
    const sponsorId = createSponsor(db, actor, event.id, {
      companyName: 'Acme Ltd',
      packageId: pkg,
      discountCents: 60000,
      dueOn: null,
      paymentStatus: 'open',
      billingAddress: '1 Example Street\nLondon',
      vatId: 'GB123456789',
      notes: null,
      contacts: [contact],
    });
    const inv = issueSponsorInvoice(db, actor, sponsorId, NOW);
    expect(inv.locale).toBe('en');
    expect(inv.items.map((i) => [i.description, i.grossCents, i.netCents, i.vatCents])).toEqual([
      ['Sponsoring package “Gold”\nSummit EN', 600000, 500000, 100000],
      ['Discount', -60000, -50000, -10000],
    ]);
    expect(inv).toMatchObject({ grossCents: 540000, netCents: 450000, vatCents: 90000, dueAt: '2027-02-15' });
    expect(inv.recipient).toMatchObject({ company: 'Acme Ltd', name: 'Max Muster', vatId: 'GB123456789', email: 'max@acme.example' });
    expect(db.select().from(sponsors).where(eq(sponsors.id, sponsorId)).get()).toMatchObject({ paymentStatus: 'invoiced', dueOn: '2027-02-15' });

    // überfällig am Tag nach der Fälligkeit; Storno setzt zurück auf „offen“
    expect(markOverdueSponsors(db, days(14))).toBe(0);
    expect(markOverdueSponsors(db, days(15))).toBe(1);
    expect(db.select().from(sponsors).where(eq(sponsors.id, sponsorId)).get()!.paymentStatus).toBe('overdue');
    cancelInvoice(db, actor, inv.id, 'Paket geändert', days(15));
    expect(db.select().from(sponsors).where(eq(sponsors.id, sponsorId)).get()!.paymentStatus).toBe('open');
  });

  it('ohne Rechnungsadresse nicht möglich', () => {
    const { db, event } = setup();
    const pkg = createPackage(db, actor, event.id, { name: { de: 'Silber' }, benefits: { de: [] }, priceCents: 100000, vatRateBp: 2000, sortOrder: 1 });
    const id = createSponsor(db, actor, event.id, {
      companyName: 'Ohne GmbH',
      packageId: pkg,
      discountCents: 0,
      dueOn: null,
      paymentStatus: 'open',
      billingAddress: '',
      vatId: null,
      notes: null,
      contacts: [{ firstName: 'A', lastName: 'B', email: 'a@ohne.example', phone: null, function: null, locale: 'de' }],
    });
    expect(codeOf(() => issueSponsorInvoice(db, actor, id, NOW)).fields).toEqual({ _form: 'billingAddressMissing' });
  });
});

describe('Gutschrift und Zahlungseingang', () => {
  it('Storno: volle Gutschrift mit gespiegelten Positionen, danach neue Rechnung möglich', () => {
    const { db, register } = setup();
    const id = register('a@example.org');
    const inv = issueRegistrationInvoice(db, actor, id, NOW);
    const credit = cancelInvoice(db, actor, inv.id, 'Falsche Adresse', NOW);
    expect(credit).toMatchObject({ type: 'credit_note', relatedInvoiceId: inv.id, grossCents: 20000, dueAt: null, note: 'Falsche Adresse', registrationId: id });
    expect(credit.items).toEqual(inv.items);
    expect(activeInvoiceOf(db, { registrationId: id })).toBeUndefined();
    expect(codeOf(() => cancelInvoice(db, actor, inv.id, 'nochmal', NOW)).fields).toEqual({ _form: 'invoiceAlreadyCredited' });
    expect(issueRegistrationInvoice(db, actor, id, NOW).number).toBe('2027-0003');
  });

  it('Teilgutschrift und Grenzen', () => {
    const { db, register } = setup();
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    const part = issueCreditNote(db, actor, inv.id, { reason: 'Kulanz', amountCents: 5000 }, NOW);
    expect(part.items[0]).toMatchObject({ description: 'Teilgutschrift zu Rechnung 2027-0001', grossCents: 5000 });
    expect(codeOf(() => issueCreditNote(db, actor, inv.id, { reason: 'x', amountCents: 15001 }, NOW)).fields).toEqual({ amount: 'outOfRange' });
    expect(activeInvoiceOf(db, { registrationId: inv.registrationId! })?.id).toBe(inv.id);
  });

  it('Überweisung verbuchen: Teilzahlung, dann bezahlt; Storno danach gesperrt', () => {
    const { db, register, reg } = setup();
    const id = register('a@example.org');
    const inv = issueRegistrationInvoice(db, actor, id, NOW);
    expect(codeOf(() => recordBankTransfer(db, actor, inv.id, { amountCents: 100, paidOn: '2027-02-02' }, NOW)).fields).toEqual({ paidOn: 'date' });
    expect(recordBankTransfer(db, actor, inv.id, { amountCents: 5000, paidOn: '2027-02-01' }, NOW)).toMatchObject({ fullyPaid: false, openCents: 15000 });
    expect(reg(id).paymentStatus).toBe('open');
    expect(codeOf(() => cancelInvoice(db, actor, inv.id, 'x', NOW)).fields).toEqual({ _form: 'invoiceHasPayments' });
    expect(recordBankTransfer(db, actor, inv.id, { amountCents: 15000, paidOn: '2027-02-01' }, NOW)).toMatchObject({ fullyPaid: true, openCents: 0 });
    expect(reg(id).paymentStatus).toBe('paid');
    expect(listInvoices(db, reg(id).eventId, NOW)[0]).toMatchObject({ state: 'paid', paidCents: 20000 });
  });

  it('Liste: offen, überfällig, storniert, Gutschrift', () => {
    const { db, register, event } = setup();
    const a = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    issueRegistrationInvoice(db, actor, register('b@example.org'), NOW);
    cancelInvoice(db, actor, a.id, 'x', NOW);
    const rows = listInvoices(db, event.id, days(20));
    expect(rows.map((r) => [r.number, r.state, r.relatedNumber])).toEqual([
      ['2027-0003', 'credit_note', '2027-0001'],
      ['2027-0002', 'overdue', null],
      ['2027-0001', 'cancelled', null],
    ]);
    expect(rows[1]).toMatchObject({ openCents: 20000, recipientCompany: 'Firma GmbH', kind: 'registration' });
  });
});

describe('Beleg und PDF', () => {
  it('Pflichtangaben (de, Kleinunternehmer) und Zahlungshinweis', () => {
    const { db, register } = setup();
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    const doc = buildInvoiceDocument(inv);
    expect(doc.title).toBe('Rechnung');
    expect(doc.seller).toEqual(['Verein Beispiel', 'Hauptplatz 1', '8010 Graz', 'office@verein.example']);
    expect(doc.recipient).toEqual(['Firma GmbH', 'z. H. Eva Muster', 'Gasse 2', '1010 Wien']);
    expect(doc.meta).toEqual([
      ['Rechnungsnummer', '2027-0001'],
      ['Rechnungsdatum', '01.02.2027'],
      ['Leistungsdatum', '12.05.2027'],
      ['Zahlbar bis', '15.02.2027'],
    ]);
    expect(doc.rows[0]).toMatchObject({ vat: '–', amount: '€\u00a0200,00' });
    expect(doc.totals).toEqual([['Gesamtbetrag', '€\u00a0200,00']]);
    expect(doc.notes[0]).toBe('Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung.');
    expect(doc.notes[1]).toContain('bis 15.02.2027 unter Angabe der Rechnungsnummer 2027-0001');
    expect(doc.notes[2]).toBe('Verein Beispiel · IBAN AT611904300234573201 · BIC BKAUATWW');
    expect(doc.fileName).toBe('Rechnung-2027-0001.pdf');
  });

  it('englisch mit USt, Gutschrift mit Bezug, Leistungszeitraum', () => {
    const { db, register } = setup({ organizer: { vatMode: 'standard', vatId: 'ATU12345678' } });
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org', 'invoice', 'en'), NOW);
    const doc = buildInvoiceDocument({ ...inv, serviceDate: '2027-05-12/2027-05-13' });
    expect(doc.title).toBe('Invoice');
    expect(doc.seller).toContain('VAT ID: ATU12345678');
    expect(doc.meta[2]).toEqual(['Service period', '12 May 2027 – 13 May 2027']);
    expect(doc.totals).toEqual([
      ['Net amount', '€166.67'],
      ['VAT 20 %', '€33.33'],
      ['Total', '€200.00'],
    ]);
    const credit = issueCreditNote(db, actor, inv.id, { reason: 'Wrong address' }, NOW);
    const cd = buildInvoiceDocument(credit, inv.number);
    expect(cd.title).toBe('Credit note');
    expect(cd.meta).toContainEqual(['Relates to invoice', '2027-0001']);
    expect(cd.notes).toEqual(['This credit note relates to invoice 2027-0001.', 'Reason: Wrong address']);
    expect(cd.fileName).toBe('Credit-note-2027-0002.pdf');
  });

  it('erzeugt ein PDF und legt es unverändert ab', async () => {
    const { db, register } = setup();
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    const direct = await renderInvoicePdf(buildInvoiceDocument(inv), { author: 'Verein Beispiel' });
    expect(direct.subarray(0, 5).toString()).toBe('%PDF-');
    const first = await invoicePdf(db, inv);
    expect(first.fileName).toBe('Rechnung-2027-0001.pdf');
    const stored = db.select().from(invoices).where(eq(invoices.id, inv.id)).get()!;
    expect(stored.pdfPath).toBe('2027/2027-0001.pdf');
    expect(fs.existsSync(path.join(dir, '2027', '2027-0001.pdf'))).toBe(true);
    const again = await invoicePdf(db, stored);
    expect(again.content.equals(first.content)).toBe(true);
  });
});

describe('E-Mails und Zahlungserinnerungen', () => {
  it('Bestätigung mit Rechnung im Anhang; Warteliste ohne', async () => {
    const { db, register } = setup();
    const { sent, mailer } = capture();
    const id = register('a@example.org');
    const out = await notifyRegistration(db, id, { mailer, now: NOW });
    expect(out.mailed).toBe(true);
    expect(sent[0]).toMatchObject({ to: 'a@example.org', subject: 'Anmeldung bestätigt: Summit', replyTo: 'office@verein.example' });
    expect(sent[0].attachments?.[0].filename).toBe('Rechnung-2027-0001.pdf');
    expect(db.select().from(invoices).get()!.sentAt).toBe(NOW.toISOString());
    // erneuter Aufruf stellt keine zweite Rechnung aus
    await notifyRegistration(db, id, { mailer, now: NOW });
    expect(db.select().from(invoices).all()).toHaveLength(1);

    const full = setup({ capacity: 0 });
    const c = capture();
    await notifyRegistration(full.db, full.register('w@example.org'), { mailer: c.mailer, now: NOW });
    expect(c.sent[0].subject).toBe('Sie stehen auf der Warteliste: Summit');
    expect(full.db.select().from(invoices).all()).toHaveLength(0);
  });

  it('ohne Veranstalterdaten: Bestätigung ohne Rechnung, Fehler im Protokoll', async () => {
    const { db, register } = setup({ organizer: null });
    const { sent, mailer } = capture();
    await notifyRegistration(db, register('a@example.org'), { mailer, now: NOW });
    expect(sent[0].attachments).toBeUndefined();
    expect(sent[0].text).toContain('gesonderten E-Mail');
    expect(db.select().from(auditLog).all().some((a) => a.action === 'invoice.failed' && a.summary.includes('organizerIncomplete'))).toBe(true);
  });

  it('Erinnerung 1 nach Fälligkeit, Erinnerung 2 nach 14 Tagen, dann keine mehr', async () => {
    const { db, register } = setup();
    const inv = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    const { sent, mailer } = capture();
    expect(findDueReminders(db, days(14))).toHaveLength(0); // am Fälligkeitstag noch nicht
    expect(await sendDueReminders(db, mailer, days(15))).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(sent[0].subject).toBe('Zahlungserinnerung: Rechnung 2027-0001 – Summit');
    expect(sent[0].attachments?.[0].filename).toBe('Rechnung-2027-0001.pdf');
    expect((await sendDueReminders(db, mailer, days(20))).sent).toBe(0);
    expect((await sendDueReminders(db, mailer, days(29))).sent).toBe(1);
    expect(sent[1].subject).toBe('2. Zahlungserinnerung: Rechnung 2027-0001 – Summit');
    expect((await sendDueReminders(db, mailer, days(60))).sent).toBe(0);
    expect(db.select().from(paymentReminders).all().map((r) => r.level)).toEqual([1, 2]);
    expect(listInvoices(db, 1, days(60))[0].reminderLevel).toBe(2);
    expect(inv.id).toBeGreaterThan(0);
  });

  it('keine Erinnerung für bezahlte, stornierte oder abgesagte; Fehlversand wird wiederholt', async () => {
    const { db, register } = setup();
    const paid = issueRegistrationInvoice(db, actor, register('a@example.org'), NOW);
    recordBankTransfer(db, actor, paid.id, { amountCents: 20000, paidOn: '2027-02-01' }, NOW);
    const cancelled = issueRegistrationInvoice(db, actor, register('b@example.org'), NOW);
    cancelInvoice(db, actor, cancelled.id, 'x', NOW);
    const cancelledReg = register('c@example.org');
    issueRegistrationInvoice(db, actor, cancelledReg, NOW);
    db.update(registrations).set({ status: 'cancelled' }).where(eq(registrations.id, cancelledReg)).run();
    expect(findDueReminders(db, days(30))).toHaveLength(0);

    const open = issueRegistrationInvoice(db, actor, register('d@example.org'), NOW);
    const failing = async () => {
      throw new Error('SMTP down');
    };
    expect(await sendDueReminders(db, failing, days(15))).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(db.select().from(paymentReminders).all()).toHaveLength(0);
    const { mailer, sent } = capture();
    expect((await sendDueReminders(db, mailer, days(15))).sent).toBe(1);
    expect(sent[0].to).toBe('d@example.org');
    expect(open.number).toBe('2027-0005');
  });

  it('Zeitplan holt fehlende Rechnungen zu Online-Zahlungen nach', async () => {
    const { db, register } = setup();
    const id = register('p@example.org', 'stripe');
    db.update(registrations).set({ status: 'confirmed', paymentStatus: 'paid', confirmedAt: NOW.toISOString() }).where(eq(registrations.id, id)).run();
    const { sent, mailer } = capture();
    expect((await runJobs(db, mailer, days(0))).invoicesIssued).toBe(0); // noch zu frisch
    const s = await runJobs(db, mailer, days(1));
    expect(s.invoicesIssued).toBe(1);
    expect(sent.at(-1)?.subject).toBe('Rechnung 2027-0001 – Summit');
    expect(sent.at(-1)?.text).toContain('bereits bezahlt');
    expect((await runJobs(db, mailer, days(2))).invoicesIssued).toBe(0);
  });
});
