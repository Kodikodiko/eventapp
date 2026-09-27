import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { cancellationAmounts, daysBeforeEvent, refundPercentFor } from '@/lib/refund-calc';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, invoices, payments, refunds, registrations } from '@/server/db/schema';
import type { MailMessage } from '@/server/mail';
import type { Refunder } from '@/server/payments/refunds';
import { cancelAndProcess, sendRefundMail } from '@/server/services/cancellation';
import { beginCheckout, markCheckoutPaid } from '@/server/services/checkout';
import { createEvent } from '@/server/services/events';
import { activeInvoiceOf, creditedCents, issueRegistrationInvoice, recordBankTransfer } from '@/server/services/invoices';
import { publishLegalVersion } from '@/server/services/legal';
import { handleProviderEvent } from '@/server/services/payment-events';
import { saveOrganizerSettings } from '@/server/services/organizer';
import { registerPublic } from '@/server/services/public-registration';
import {
  approveRefund,
  createManualRefund,
  executeRefund,
  listRefunds,
  quoteCancellation,
  recordRefundTransfer,
  refundableCents,
  rejectRefund,
} from '@/server/services/refunds';

const actor = { userId: 'admin-1' };
// Event am 12.05.2027; NOW = 01.02.2027 → 100 Tage vorher
const NOW = new Date('2027-02-01T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

let dir: string;
let previousDir: string | undefined;
beforeAll(() => {
  previousDir = process.env.INVOICE_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-refunds-'));
  process.env.INVOICE_DIR = dir;
});
afterAll(() => {
  process.env.INVOICE_DIR = previousDir;
  fs.rmSync(dir, { recursive: true, force: true });
});

const okRefunder = (): Refunder & { calls: number[] } => {
  const calls: number[] = [];
  const f = (async (req) => {
    calls.push(req.amountCents);
    return { id: `re_${calls.length}`, status: 'succeeded' as const };
  }) as Refunder & { calls: number[] };
  f.calls = calls;
  return f;
};

function capture() {
  const sent: MailMessage[] = [];
  return { sent, mailer: async (m: MailMessage) => void sent.push(m) };
}

function setup(options: { refundMode?: 'automatic' | 'approval'; rules?: { daysBeforeEvent: number; refundPercent: number }[] } = {}) {
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
    refundMode: options.refundMode ?? 'automatic',
    cancellationRules: options.rules ?? [
      { daysBeforeEvent: 30, refundPercent: 100 },
      { daysBeforeEvent: 14, refundPercent: 50 },
    ],
  });
  const terms = publishLegalVersion(db, actor, 'terms', event.id, { de: 'AGB' });
  const privacy = publishLegalVersion(db, actor, 'privacy', null, { de: 'DS' });
  const register = (email: string, method: 'invoice' | 'stripe') => {
    const input: PublicRegistrationInput = {
      firstName: 'Eva',
      lastName: 'Muster',
      email,
      company: null,
      locale: 'de',
      memberNumber: null,
      paymentMethod: method,
      billingCompany: method === 'invoice' ? 'Firma' : null,
      billingAddress: method === 'invoice' ? 'Adresse 1' : null,
      photoConsent: false,
      newsletter: false,
      termsDocumentId: terms.id,
      privacyDocumentId: privacy.id,
      expectedPriceCents: 20000,
    };
    return registerPublic(db, event.id, input, { stripeEnabled: true, now: NOW }).registrationId;
  };
  /** online bezahlt, mit Rechnung */
  const paidOnline = async (email: string) => {
    const id = register(email, 'stripe');
    let n = 0;
    await beginCheckout(
      db,
      { name: 'fake', createCheckout: async () => ({ id: `fake_cs_${email}_${++n}`, url: 'x' }), checkoutUrl: async () => null },
      id,
      { locale: 'de', now: NOW }
    );
    const session = db.select().from(payments).where(eq(payments.registrationId, id)).get()!.stripeCheckoutSessionId!;
    markCheckoutPaid(db, { sessionId: session, paymentIntentId: `pi_${email}`, amountCents: 20000 }, NOW);
    issueRegistrationInvoice(db, actor, id, NOW);
    return id;
  };
  /** Rechnung, per Überweisung bezahlt */
  const paidTransfer = (email: string) => {
    const id = register(email, 'invoice');
    const inv = issueRegistrationInvoice(db, actor, id, NOW);
    recordBankTransfer(db, actor, inv.id, { amountCents: 20000, paidOn: '2027-02-01' }, NOW);
    return id;
  };
  const reg = (id: number) => db.select().from(registrations).where(eq(registrations.id, id)).get()!;
  return { db, event, register, paidOnline, paidTransfer, reg };
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

describe('Stornobedingungen und Beträge', () => {
  it('Tage vor Beginn in Wiener Kalendertagen, höchste passende Zeile gilt', () => {
    expect(daysBeforeEvent('2027-05-12T06:00:00.000Z', '2027-05-11T22:30:00.000Z')).toBe(0); // 00:30 Wien am Eventtag
    expect(daysBeforeEvent('2027-05-12T06:00:00.000Z', '2027-04-12T10:00:00.000Z')).toBe(30);
    const rules = [
      { daysBeforeEvent: 30, refundPercent: 100 },
      { daysBeforeEvent: 14, refundPercent: 50 },
    ];
    expect(refundPercentFor(rules, 30)).toBe(100);
    expect(refundPercentFor(rules, 29)).toBe(50);
    expect(refundPercentFor(rules, 13)).toBe(0);
    expect(refundPercentFor([], 100)).toBeNull();
  });

  it('Gutschrift, Gebühr, Erstattung, offener Rest', () => {
    expect(cancellationAmounts({ invoiceCents: 14900, paidCents: 14900, percent: 50 })).toEqual({ creditCents: 7450, feeCents: 7450, refundCents: 7450, openCents: 0 });
    expect(cancellationAmounts({ invoiceCents: 14900, paidCents: 0, percent: 50 })).toEqual({ creditCents: 7450, feeCents: 7450, refundCents: 0, openCents: 7450 });
    expect(cancellationAmounts({ invoiceCents: 14900, paidCents: 10000, percent: 50 })).toEqual({ creditCents: 7450, feeCents: 7450, refundCents: 2550, openCents: 0 });
    expect(cancellationAmounts({ invoiceCents: 999, paidCents: 999, percent: 33 })).toEqual({ creditCents: 329, feeCents: 670, refundCents: 329, openCents: 0 });
  });
});

describe('Storno mit Erstattung', () => {
  it('Online bezahlt, 100 %: Erstattung über die Kasse, Gutschrift, E-Mails', async () => {
    const { db, paidOnline, reg } = setup();
    const id = await paidOnline('a@example.org');
    expect(quoteCancellation(db, id, NOW)).toMatchObject({ daysBefore: 100, rulePercent: 100, invoiceNumber: '2027-0001', paidCents: 20000 });
    const refunder = okRefunder();
    const { sent, mailer } = capture();
    const r = await cancelAndProcess(db, actor, id, { reason: 'krank', source: 'admin', notify: true }, { refunder, mailer, now: NOW });
    expect(r).toMatchObject({ percent: 100, refundStatus: 'approved', failedRefunds: 0, mailed: true });
    expect(refunder.calls).toEqual([20000]);
    expect(reg(id)).toMatchObject({ status: 'cancelled', paymentStatus: 'refunded', cancelReason: 'krank' });
    const refund = db.select().from(refunds).get()!;
    expect(refund).toMatchObject({ status: 'executed', amountCents: 20000, stripeRefundId: 're_1', rulePercent: 100 });
    const credit = db.select().from(invoices).where(eq(invoices.id, refund.creditNoteId!)).get()!;
    expect(credit).toMatchObject({ type: 'credit_note', number: '2027-0002', grossCents: 20000 });
    expect(sent.map((m) => m.subject)).toEqual(['Stornierung bestätigt: Summit', 'Erstattung über € 200,00: Summit']);
    expect(sent[0].text).toContain('ursprünglich verwendete Zahlungsmittel');
    expect(sent[1].attachments?.[0].filename).toBe('Gutschrift-2027-0002.pdf');
    expect(refundableCents(db, id)).toBe(0);
  });

  it('50 % laut Staffel; Admin kann abweichen (protokolliert)', async () => {
    const { db, paidOnline } = setup();
    const id = await paidOnline('a@example.org');
    const later = at('2027-04-20T10:00:00.000Z'); // 22 Tage vorher
    expect(quoteCancellation(db, id, later)).toMatchObject({ rulePercent: 50, amounts: { refundCents: 10000, creditCents: 10000, openCents: 0 } });
    const refunder = okRefunder();
    await cancelAndProcess(db, actor, id, { reason: 'x', percent: 80, source: 'admin', notify: false }, { refunder, now: later });
    expect(refunder.calls).toEqual([16000]);
    expect(db.select().from(auditLog).all().some((a) => a.action === 'registration.cancelled' && a.summary.includes('80 % (abweichend'))).toBe(true);
  });

  it('Rechnung unbezahlt: sofortige Gutschrift, Stornogebühr bleibt offen', async () => {
    const { db, register, reg } = setup();
    const id = register('a@example.org', 'invoice');
    const inv = issueRegistrationInvoice(db, actor, id, NOW);
    const { sent, mailer } = capture();
    const r = await cancelAndProcess(db, actor, id, { reason: 'Terminkollision', source: 'admin', notify: true }, { mailer, now: at('2027-04-20T10:00:00.000Z') });
    expect(r.amounts).toEqual({ creditCents: 10000, feeCents: 10000, refundCents: 0, openCents: 10000 });
    expect(r.creditNote).toMatchObject({ type: 'credit_note', grossCents: 10000, relatedInvoiceId: inv.id });
    expect(activeInvoiceOf(db, { registrationId: id })?.id).toBe(inv.id);
    expect(reg(id).paymentStatus).toBe('open');
    expect(sent[0].text).toContain('Stornogebühr von € 100,00');
    expect(sent[0].attachments?.[0].filename).toMatch(/^Gutschrift-/);
    expect(db.select().from(refunds).all()).toHaveLength(0);
  });

  it('Rechnung unbezahlt, 100 %: voll gutgeschrieben, keine Zahlung mehr nötig', async () => {
    const { db, register, reg } = setup();
    const id = register('a@example.org', 'invoice');
    const inv = issueRegistrationInvoice(db, actor, id, NOW);
    await cancelAndProcess(db, actor, id, { reason: 'x', source: 'admin', notify: false }, { now: NOW });
    expect(creditedCents(db, inv.id)).toBe(20000);
    expect(reg(id).paymentStatus).toBe('not_required');
  });

  it('Überweisung: Erstattung freigegeben, nach Rücküberweisung verbucht', async () => {
    const { db, paidTransfer, reg } = setup();
    const id = paidTransfer('a@example.org');
    const r = await cancelAndProcess(db, actor, id, { reason: 'x', source: 'admin', notify: false }, { now: NOW });
    expect(r.executeIds).toEqual([]);
    const refund = db.select().from(refunds).get()!;
    expect(refund.status).toBe('approved');
    expect(codeOf(() => recordRefundTransfer(db, actor, refund.id, '2027-02-02', NOW)).fields).toEqual({ transferredOn: 'date' });
    await expect(executeRefund(db, actor, refund.id, { refunder: okRefunder() })).rejects.toThrow(ServiceError);
    const [done] = recordRefundTransfer(db, actor, refund.id, '2027-02-01', NOW);
    expect(done).toMatchObject({ status: 'executed', executedAt: '2027-02-01T11:00:00.000Z' });
    expect(done.creditNoteId).not.toBeNull();
    expect(reg(id).paymentStatus).toBe('refunded');
  });

  it('Teilzahlungen per Überweisung: eine Rücküberweisung, eine Gutschrift', async () => {
    const { db, register } = setup();
    const id = register('t@example.org', 'invoice');
    const inv = issueRegistrationInvoice(db, actor, id, NOW);
    recordBankTransfer(db, actor, inv.id, { amountCents: 12000, paidOn: '2027-02-01' }, NOW);
    recordBankTransfer(db, actor, inv.id, { amountCents: 8000, paidOn: '2027-02-01' }, NOW);
    await cancelAndProcess(db, actor, id, { reason: 'x', source: 'admin', notify: false }, { now: NOW });
    const rows = db.select().from(refunds).all();
    expect(rows.map((r) => r.amountCents).sort()).toEqual([12000, 8000].sort());
    const done = recordRefundTransfer(db, actor, rows[0].id, '2027-02-01', NOW);
    expect(done).toHaveLength(2);
    expect(new Set(done.map((r) => r.creditNoteId)).size).toBe(1);
    const { sent, mailer } = capture();
    await sendRefundMail(db, done, mailer);
    expect(sent[0].subject).toBe('Erstattung über €\u00a0200,00: Summit');
  });

  it('Modus „mit Freigabe“: Storno durch Teilnehmende erzeugt Vorschlag; Freigabe mit geändertem Betrag', async () => {
    const { db, paidOnline, reg } = setup({ refundMode: 'approval' });
    const id = await paidOnline('a@example.org');
    const refunder = okRefunder();
    const out = await cancelAndProcess(db, actor, id, { reason: 'Portal', source: 'attendee', notify: false }, { refunder, now: NOW });
    expect(out.refundStatus).toBe('proposed');
    expect(refunder.calls).toEqual([]);
    const proposal = listRefunds(db, reg(id).eventId)[0];
    expect(proposal).toMatchObject({ status: 'proposed', amountCents: 20000, method: 'stripe' });
    expect(codeOf(() => approveRefund(db, actor, proposal.id, 20001)).fields).toEqual({ amount: 'refundTooHigh' });
    approveRefund(db, actor, proposal.id, 15000);
    await executeRefund(db, actor, proposal.id, { refunder });
    expect(refunder.calls).toEqual([15000]);
    expect(reg(id).paymentStatus).toBe('partially_refunded');
    expect(refundableCents(db, id)).toBe(5000);
  });

  it('Ablehnen; Admin-Storno im Freigabe-Modus ist sofort freigegeben', async () => {
    const { db, paidOnline, reg } = setup({ refundMode: 'approval' });
    const a = await paidOnline('a@example.org');
    await cancelAndProcess(db, actor, a, { reason: 'x', source: 'attendee', notify: false }, { now: NOW });
    const p = db.select().from(refunds).get()!;
    rejectRefund(db, actor, p.id, 'AGB nicht erfüllt', NOW);
    expect(db.select().from(refunds).get()).toMatchObject({ status: 'rejected', failureMessage: 'AGB nicht erfüllt' });
    expect(reg(a).paymentStatus).toBe('paid');

    const b = await paidOnline('b@example.org');
    const refunder = okRefunder();
    const out = await cancelAndProcess(db, actor, b, { reason: 'x', source: 'admin', notify: false }, { refunder, now: NOW });
    expect(out.refundStatus).toBe('approved');
    expect(refunder.calls).toEqual([20000]);
  });

  it('Kasse lehnt ab → fehlgeschlagen, erneuter Versuch klappt', async () => {
    const { db, paidOnline, reg } = setup();
    const id = await paidOnline('a@example.org');
    const broken: Refunder = async () => {
      throw new Error('Stripe nicht erreichbar');
    };
    const out = await cancelAndProcess(db, actor, id, { reason: 'x', source: 'admin', notify: false }, { refunder: broken, now: NOW });
    expect(out.failedRefunds).toBe(1);
    const failed = db.select().from(refunds).get()!;
    expect(failed).toMatchObject({ status: 'failed', failureMessage: 'Stripe nicht erreichbar' });
    expect(reg(id).paymentStatus).toBe('paid');
    const r = await executeRefund(db, actor, failed.id, { refunder: okRefunder(), now: NOW });
    expect(r.status).toBe('executed');
    expect(reg(id).paymentStatus).toBe('refunded');
  });
});

describe('Manuelle Erstattung und Stripe-Abgleich', () => {
  it('Kulanz-Erstattung ohne Storno, bis zum erstattbaren Betrag', async () => {
    const { db, paidOnline, reg } = setup();
    const id = await paidOnline('a@example.org');
    expect(codeOf(() => createManualRefund(db, actor, id, { amountCents: 20001, reason: 'x' })).fields).toEqual({ amount: 'refundTooHigh' });
    const [r] = createManualRefund(db, actor, id, { amountCents: 3000, reason: 'Kulanz Anreise' });
    expect(r.status).toBe('approved');
    await executeRefund(db, actor, r.id, { refunder: okRefunder(), now: NOW });
    expect(reg(id)).toMatchObject({ status: 'confirmed', paymentStatus: 'partially_refunded' });
    const credit = db.select().from(invoices).where(eq(invoices.id, db.select().from(refunds).get()!.creditNoteId!)).get()!;
    expect(credit).toMatchObject({ grossCents: 3000, note: 'Kulanz Anreise' });
  });

  it('Erstattung im Stripe-Dashboard wird per Webhook übernommen, eigene nicht doppelt', async () => {
    const { db, paidOnline, reg } = setup();
    const id = await paidOnline('a@example.org');
    const [own] = createManualRefund(db, actor, id, { amountCents: 5000, reason: 'Kulanz' });
    await executeRefund(db, actor, own.id, { refunder: okRefunder(), now: NOW });
    const evt = (n: number, total: number) => ({ id: `evt_${n}`, type: 'charge.refunded', object: { id: 'ch_1', payment_intent: 'pi_a@example.org', amount_refunded: total } });
    expect(handleProviderEvent(db, evt(1, 5000), NOW)).toMatchObject({ result: 'refund_known', syncedRefundId: null });
    const r = handleProviderEvent(db, evt(2, 12000), NOW);
    expect(r.result).toMatch(/^refund_synced:/);
    const synced = db.select().from(refunds).where(eq(refunds.id, r.syncedRefundId!)).get()!;
    expect(synced).toMatchObject({ amountCents: 7000, status: 'executed', reason: 'Erstattung direkt in Stripe' });
    expect(synced.creditNoteId).not.toBeNull();
    expect(reg(id).paymentStatus).toBe('partially_refunded');
    expect(handleProviderEvent(db, evt(2, 12000), NOW).duplicate).toBe(true);
  });
});
