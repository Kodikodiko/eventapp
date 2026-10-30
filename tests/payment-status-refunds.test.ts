import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { RegistrationAdminInput } from '@/lib/validation/registrations';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, payments, refunds, registrations } from '@/server/db/schema';
import type { MailMessage } from '@/server/mail';
import { previewBulkRefund, runBulkRefund } from '@/server/services/bulk-refunds';
import { cancelAndProcess, refundAndProcess } from '@/server/services/cancellation';
import { createEvent } from '@/server/services/events';
import { issueRegistrationInvoice, listInvoices } from '@/server/services/invoices';
import { saveOrganizerSettings } from '@/server/services/organizer';
import { paymentStatusOptions, setPaymentStatusManually } from '@/server/services/payment-status';
import { refundableCents } from '@/server/services/refunds';
import { createRegistrationByAdmin } from '@/server/services/registrations';

const actor = { userId: 'admin-1' };
// Event am 12.05.2027; NOW = 01.02.2027 → 100 Tage vorher
const NOW = new Date('2027-02-01T10:00:00.000Z');

let dir: string;
let previousDir: string | undefined;
beforeAll(() => {
  previousDir = process.env.INVOICE_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-paystatus-'));
  process.env.INVOICE_DIR = dir;
});
afterAll(() => {
  process.env.INVOICE_DIR = previousDir;
  fs.rmSync(dir, { recursive: true, force: true });
});

function capture() {
  const sent: MailMessage[] = [];
  return { sent, mailer: async (m: MailMessage) => void sent.push(m) };
}

function setup(rules = [{ daysBeforeEvent: 30, refundPercent: 100 }, { daysBeforeEvent: 14, refundPercent: 50 }]) {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  saveOrganizerSettings(db, actor, {
    name: 'Verein Beispiel',
    address: 'Hauptplatz 1\n8010 Graz',
    vatId: null,
    iban: 'AT611904300234573201',
    bic: null,
    contactEmail: 'office@verein.example',
    vatMode: 'small_business',
    smallBusinessNote: null,
    invoicePaymentTermDays: 14,
  });
  const event = createEvent(db, actor, {
    slug: 'summit',
    name: { de: 'Summit' },
    description: null,
    location: '',
    startsAt: '2027-05-12T06:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: 10,
    priceNormalCents: 20000,
    priceMemberCents: 15000,
    ticketVatRateBp: 2000,
    allowStripe: true,
    allowInvoice: true,
    refundMode: 'automatic',
    cancellationRules: rules,
  });
  const add = (email: string, o: Partial<RegistrationAdminInput> = {}) =>
    createRegistrationByAdmin(db, actor, event.id, {
      firstName: 'Eva',
      lastName: email.split('@')[0],
      email,
      company: null,
      locale: 'de',
      roles: ['attendee'],
      ticketType: 'normal',
      priceCents: 20000,
      billingCompany: null,
      billingAddress: 'Adresse 1',
      status: 'confirmed',
      overbook: false,
      ...o,
    });
  /** von Hand als bezahlt markiert (ohne Rechnung) */
  const addPaid = (email: string, o: Partial<RegistrationAdminInput> = {}) => {
    const id = add(email, o);
    setPaymentStatusManually(db, actor, id, { status: 'paid', note: 'Überweisung lt. Kontoauszug', paidOn: '2027-01-30' }, NOW);
    return id;
  };
  const reg = (id: number) => db.select().from(registrations).where(eq(registrations.id, id)).get()!;
  return { db, event, add, addPaid, reg };
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

describe('Sonderpreis', () => {
  it('Sonderpreis 0 → kostenlos; mit Betrag → Zahlung offen, Rechnung mit eigenem Text', () => {
    const { db, add, reg } = setup();
    const free = add('free@example.org', { ticketType: 'special', priceCents: 0 });
    expect(reg(free)).toMatchObject({ ticketType: 'special', priceCents: 0, paymentMethod: 'free', paymentStatus: 'not_required' });
    const special = add('special@example.org', { ticketType: 'special', priceCents: 5000 });
    expect(reg(special)).toMatchObject({ ticketType: 'special', priceCents: 5000, paymentStatus: 'open' });
    const inv = issueRegistrationInvoice(db, actor, special, NOW);
    expect(inv.grossCents).toBe(5000);
    expect(JSON.stringify(inv.items)).toContain('Sonderpreis');
  });
});

describe('Zahlungsstatus von Hand', () => {
  it('offen → bezahlt ohne Rechnung: Zahlungseingang, erstattbar, protokolliert', () => {
    const { db, add, reg } = setup();
    const id = add('a@example.org');
    expect(paymentStatusOptions(db, id)).toMatchObject({ current: 'open', openCents: 20000, targets: ['paid', 'not_required'], hasInvoice: false });
    expect(codeOf(() => setPaymentStatusManually(db, actor, id, { status: 'paid', note: '  ', paidOn: '2027-01-30' }, NOW)).code).toBe('INVALID');
    expect(codeOf(() => setPaymentStatusManually(db, actor, id, { status: 'paid', note: 'x', paidOn: '2027-03-01' }, NOW)).code).toBe('INVALID');
    setPaymentStatusManually(db, actor, id, { status: 'paid', note: 'bar am Eingang', paidOn: '2027-01-30' }, NOW);
    expect(reg(id).paymentStatus).toBe('paid');
    expect(db.select().from(payments).where(eq(payments.registrationId, id)).all()).toMatchObject([
      { method: 'bank_transfer', status: 'succeeded', amountCents: 20000, recordedBy: 'admin-1' },
    ]);
    expect(refundableCents(db, id)).toBe(20000);
    const log = db.select().from(auditLog).where(eq(auditLog.action, 'payment.status_changed')).get()!;
    expect(log).toMatchObject({ entity: 'registration', entityId: String(id) });
    expect(log.summary).toContain('Offen → Bezahlt');
    expect(log.summary).toContain('bar am Eingang');
  });

  it('bezahlt → offen nimmt die Buchung zurück; nicht nötig ↔ offen', () => {
    const { db, addPaid, add, reg } = setup();
    const id = addPaid('a@example.org');
    expect(paymentStatusOptions(db, id).targets).toEqual(['open']);
    setPaymentStatusManually(db, actor, id, { status: 'open', note: 'Fehlbuchung' }, NOW);
    expect(reg(id).paymentStatus).toBe('open');
    expect(db.select().from(payments).where(eq(payments.registrationId, id)).get()!.status).toBe('failed');
    expect(refundableCents(db, id)).toBe(0);

    const other = add('b@example.org');
    setPaymentStatusManually(db, actor, other, { status: 'not_required', note: 'Freiplatz' }, NOW);
    expect(reg(other).paymentStatus).toBe('not_required');
    expect(paymentStatusOptions(db, other).targets).toEqual(['open', 'paid']);
    setPaymentStatusManually(db, actor, other, { status: 'paid', note: 'doch bezahlt', paidOn: '2027-02-01' }, NOW);
    expect(reg(other).paymentStatus).toBe('paid');
  });

  it('mit Rechnung: Zahlungseingang zur Rechnung; erlassen nicht möglich; nach Erstattung gesperrt', async () => {
    const { db, add, reg } = setup();
    const id = add('a@example.org');
    issueRegistrationInvoice(db, actor, id, NOW);
    expect(paymentStatusOptions(db, id).targets).toEqual(['paid']);
    expect(codeOf(() => setPaymentStatusManually(db, actor, id, { status: 'not_required', note: 'x' }, NOW)).code).toBe('CONFLICT');
    setPaymentStatusManually(db, actor, id, { status: 'paid', note: 'Kontoauszug', paidOn: '2027-02-01' }, NOW);
    expect(listInvoices(db, reg(id).eventId, NOW)[0].state).toBe('paid');
    await refundAndProcess(db, actor, id, { amountCents: 1000, reason: 'Kulanz', transferDone: true }, { mailer: capture().mailer, now: NOW });
    expect(reg(id).paymentStatus).toBe('partially_refunded');
    expect(paymentStatusOptions(db, id).targets).toEqual([]);
  });
});

describe('Erstattungen', () => {
  it('Abmeldung mit 100 % und erledigter Rücküberweisung in einem Schritt', async () => {
    const { db, addPaid, reg } = setup();
    const id = addPaid('a@example.org');
    const { sent, mailer } = capture();
    const r = await cancelAndProcess(db, actor, id, { reason: 'Abmeldung', percent: 100, source: 'admin', notify: true, transferDone: true }, { mailer, now: NOW });
    expect(r.amounts.refundCents).toBe(20000);
    expect(reg(id)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded' });
    expect(db.select().from(refunds).all()).toMatchObject([{ status: 'executed', amountCents: 20000 }]);
    expect(sent[0].subject).toBe('Stornierung bestätigt: Summit');
    expect(sent[1].subject).toMatch(/^Erstattung über €\s200,00: Summit$/);
  });

  it('ohne „erledigt“ wartet die Überweisungs-Erstattung', async () => {
    const { db, addPaid } = setup();
    const id = addPaid('a@example.org');
    const r = await refundAndProcess(db, actor, id, { amountCents: 10000, reason: 'Teilerstattung', transferDone: false }, { mailer: capture().mailer, now: NOW });
    expect(r.status).toBe('approved');
    expect(db.select().from(refunds).get()).toMatchObject({ status: 'approved', amountCents: 10000 });
    expect(refundableCents(db, id)).toBe(10000);
  });

  it('Sammel-Erstattung: Vorschau nach Stornobedingungen, Ausführung mit Storno', async () => {
    const { db, addPaid, add, reg } = setup();
    const a = addPaid('a@example.org');
    const b = addPaid('b@example.org');
    const c = add('c@example.org'); // unbezahlt
    const done = addPaid('d@example.org');
    await cancelAndProcess(db, actor, done, { reason: 'x', source: 'admin', notify: false }, { mailer: capture().mailer, now: NOW });

    const input = { ids: [a, b, c, done], cancel: true, mode: 'rules' as const, percent: 0, reason: 'Eventabsage', notify: false, transferDone: true };
    const preview = previewBulkRefund(db, input, NOW);
    expect(preview).toMatchObject({ count: 3, totalRefundCents: 40000 });
    expect(preview.rows.find((r) => r.registrationId === done)!.skip).toBe('alreadyCancelled');
    expect(preview.rows.find((r) => r.registrationId === c)).toMatchObject({ percent: 100, refundCents: 0, skip: null });

    const result = await runBulkRefund(db, actor, input, { mailer: capture().mailer, now: NOW });
    expect(result).toMatchObject({ done: 3, refundedCents: 40000, failed: 0, awaitingTransfer: 0, skipped: 1 });
    expect([a, b, c].map((id) => reg(id).status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    expect([a, b].map((id) => reg(id).paymentStatus)).toEqual(['refunded', 'refunded']);
    expect(reg(c).paymentStatus).toBe('not_required');
  });

  it('Sammel-Teilerstattung ohne Storno mit festem Satz', async () => {
    const { db, addPaid, add, reg } = setup();
    const a = addPaid('a@example.org');
    const b = add('b@example.org'); // nichts bezahlt → übersprungen
    const input = { ids: [a, b], cancel: false, mode: 'percent' as const, percent: 25, reason: 'Kulanz', notify: false, transferDone: false };
    expect(previewBulkRefund(db, input, NOW)).toMatchObject({ count: 1, totalRefundCents: 5000 });
    const result = await runBulkRefund(db, actor, input, { mailer: capture().mailer, now: NOW });
    expect(result).toMatchObject({ done: 1, refundedCents: 5000, awaitingTransfer: 1, skipped: 1 });
    expect(reg(a).status).toBe('confirmed');
    expect(db.select().from(refunds).get()).toMatchObject({ status: 'approved', amountCents: 5000 });
  });
});
