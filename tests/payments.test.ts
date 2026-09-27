import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, payments, registrations, waitlistOffers } from '@/server/db/schema';
import type { MailMessage } from '@/server/mail';
import type { PaymentProvider } from '@/server/payments/provider';
import { resetRateLimits } from '@/server/rate-limit';
import { runJobs } from '@/server/services/automation';
import {
  beginCheckout,
  CHECKOUT_VALID_MS,
  EXPIRY_GRACE_MS,
  expireStaleReservations,
  getCheckoutView,
  markCheckoutClosed,
  markCheckoutPaid,
  resumeCheckout,
} from '@/server/services/checkout';
import { createEvent, getEvent, getEventStats } from '@/server/services/events';
import { publishLegalVersion } from '@/server/services/legal';
import { handleProviderEvent } from '@/server/services/payment-events';
import { registerPublic } from '@/server/services/public-registration';
import { cancelRegistrationByAdmin } from '@/server/services/registrations';
import { acceptOffer, expireOffers, getOfferView, offerFreeSeats, OFFER_VALID_MS } from '@/server/services/waitlist';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);

function testProvider(): PaymentProvider & { created: string[]; fail: boolean } {
  let n = 0;
  const p = {
    name: 'fake' as const,
    created: [] as string[],
    fail: false,
    async createCheckout() {
      if (p.fail) throw new Error('Kasse offline');
      const id = `fake_cs_test_${++n}`;
      p.created.push(id);
      return { id, url: `https://pay.example/${id}` };
    },
    async checkoutUrl(id: string) {
      return `https://pay.example/${id}`;
    },
  };
  return p;
}

function setup(capacity = 2) {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const event = createEvent(db, actor, {
    slug: 'summit',
    name: { de: 'Summit' },
    description: null,
    location: '',
    startsAt: '2027-05-12T06:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity,
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
  const register = (email: string, method: 'stripe' | 'invoice' = 'stripe', now = NOW) => {
    const input: PublicRegistrationInput = {
      firstName: 'Eva',
      lastName: email.split('@')[0],
      email,
      company: null,
      locale: 'de',
      memberNumber: null,
      paymentMethod: method,
      billingCompany: method === 'invoice' ? 'Firma' : null,
      billingAddress: method === 'invoice' ? 'Adresse' : null,
      photoConsent: false,
      newsletter: false,
      termsDocumentId: terms.id,
      privacyDocumentId: privacy.id,
      expectedPriceCents: 20000,
    };
    return registerPublic(db, event.id, input, { stripeEnabled: true, now });
  };
  const reg = (id: number) => db.select().from(registrations).where(eq(registrations.id, id)).get()!;
  return { db, event, register, reg, provider: testProvider() };
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

beforeEach(() => resetRateLimits());

describe('Kasse', () => {
  it('startet eine Sitzung mit Serverpreis und verlängert die Reservierung', async () => {
    const { db, register, reg, provider } = setup();
    const r = register('a@example.org');
    expect(r.status).toBe('reserved');
    const start = await beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW });
    expect(start.url).toBe('https://pay.example/fake_cs_test_1');
    const p = db.select().from(payments).get()!;
    expect(p).toMatchObject({ status: 'pending', method: 'stripe', amountCents: 20000, stripeCheckoutSessionId: 'fake_cs_test_1', publicRef: start.ref });
    expect(reg(r.registrationId).reservedUntil).toBe(later(CHECKOUT_VALID_MS).toISOString());
    expect(getCheckoutView(db, start.ref)).toMatchObject({ registrationStatus: 'reserved', paymentStatus: 'pending', amountCents: 20000, eventSlug: 'summit' });
    expect(await resumeCheckout(db, provider, start.ref, 'de', NOW)).toContain('fake_cs_test_1');
  });

  it('Zahlung bestätigt die Anmeldung genau einmal', async () => {
    const { db, register, reg, provider } = setup();
    const r = register('a@example.org');
    await beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW });
    expect(markCheckoutPaid(db, { sessionId: 'fake_cs_test_1', paymentIntentId: 'pi_1', amountCents: 20000 }, NOW).outcome).toBe('confirmed');
    expect(markCheckoutPaid(db, { sessionId: 'fake_cs_test_1', paymentIntentId: 'pi_1', amountCents: 20000 }, NOW).outcome).toBe('duplicate');
    expect(reg(r.registrationId)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid', reservedUntil: null });
    expect(db.select().from(payments).get()).toMatchObject({ status: 'succeeded', stripePaymentIntentId: 'pi_1' });
    expect(db.select().from(auditLog).all().filter((a) => a.action === 'payment.succeeded')).toHaveLength(1);
    expect(markCheckoutPaid(db, { sessionId: 'unbekannt', paymentIntentId: null, amountCents: null }).outcome).toBe('unknown');
  });

  it('Ablauf gibt den Platz frei; eine verspätete Zahlung wird trotzdem angenommen', async () => {
    const { db, event, register, reg, provider } = setup(1);
    const r = register('a@example.org');
    await beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW });
    expect(getEventStats(db, event, NOW).seatsFree).toBe(0);
    expect(markCheckoutClosed(db, 'fake_cs_test_1', 'expired', NOW)).toMatchObject({ released: true });
    expect(reg(r.registrationId)).toMatchObject({ status: 'cancelled', cancelReason: 'Reservierung abgelaufen (keine Zahlung)' });
    expect(getEventStats(db, event, NOW).seatsFree).toBe(1);
    await expect(resumeCheckout(db, provider, db.select().from(payments).get()!.publicRef!, 'de', NOW)).rejects.toThrow(ServiceError);
    // Zahlung kommt trotzdem an (z. B. verzögerte Bankzahlung): bestätigen, im Protokoll vermerken
    db.update(payments).set({ status: 'pending' }).run();
    expect(markCheckoutPaid(db, { sessionId: 'fake_cs_test_1', paymentIntentId: 'pi', amountCents: 20000 }, NOW).outcome).toBe('late');
    expect(reg(r.registrationId).status).toBe('confirmed');
    expect(db.select().from(auditLog).all().at(-1)!.summary).toContain('nach Ablauf bezahlt');
  });

  it('ist die Kasse nicht erreichbar, wird die Reservierung sofort freigegeben', async () => {
    const { db, register, reg, provider } = setup();
    provider.fail = true;
    const r = register('a@example.org');
    await expect(beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW })).rejects.toThrow('Kasse offline');
    expect(reg(r.registrationId)).toMatchObject({ status: 'cancelled', cancelReason: 'Kasse nicht erreichbar' });
    expect(db.select().from(payments).get()!.status).toBe('failed');
  });

  it('Zeitplan storniert Reservierungen erst nach Ablauf plus Puffer', async () => {
    const { db, register, reg, provider } = setup();
    const r = register('a@example.org');
    await beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW });
    expect(expireStaleReservations(db, later(CHECKOUT_VALID_MS + 60_000))).toEqual([]);
    expect(expireStaleReservations(db, later(CHECKOUT_VALID_MS + EXPIRY_GRACE_MS + 1000))).toHaveLength(1);
    expect(reg(r.registrationId).status).toBe('cancelled');
    expect(db.select().from(payments).get()!.status).toBe('expired');
  });
});

describe('Webhook-Ereignisse', () => {
  it('werden genau einmal verarbeitet', async () => {
    const { db, register, reg, provider } = setup();
    const r = register('a@example.org');
    await beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW });
    const pending = { id: 'fake_cs_test_1', payment_status: 'unpaid', amount_total: 20000, payment_intent: null };
    expect(handleProviderEvent(db, { id: 'evt_1', type: 'checkout.session.completed', object: pending }, NOW).result).toBe('awaiting_async_payment');
    expect(reg(r.registrationId).status).toBe('reserved');
    const ok = handleProviderEvent(db, { id: 'evt_2', type: 'checkout.session.async_payment_succeeded', object: { ...pending, payment_status: 'paid', payment_intent: { id: 'pi_9' } } }, NOW);
    expect(ok).toMatchObject({ result: 'paid:confirmed', duplicate: false });
    expect(handleProviderEvent(db, { id: 'evt_2', type: 'checkout.session.async_payment_succeeded', object: pending }, NOW)).toMatchObject({ duplicate: true });
    expect(handleProviderEvent(db, { id: 'evt_3', type: 'charge.dispute.created', object: { id: 'x' } }, NOW).result).toBe('ignored');
    expect(reg(r.registrationId)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
  });

  it('abgelaufene Sitzung gibt frei', async () => {
    const { db, register, reg, provider } = setup();
    const r = register('a@example.org');
    await beginCheckout(db, provider, r.registrationId, { locale: 'de', now: NOW });
    const res = handleProviderEvent(db, { id: 'evt_x', type: 'checkout.session.expired', object: { id: 'fake_cs_test_1' } }, NOW);
    expect(res).toMatchObject({ result: 'released' });
    expect(reg(r.registrationId).status).toBe('cancelled');
  });
});

describe('Warteliste', () => {
  it('bietet frei gewordene Plätze der Reihe nach an; offene Angebote halten den Platz', () => {
    const { db, event, register, reg } = setup(1);
    const a = register('a@example.org', 'invoice');
    const b = register('b@example.org', 'invoice', later(1000));
    const c = register('c@example.org', 'stripe', later(2000));
    expect([a.status, b.status, c.status]).toEqual(['confirmed', 'waitlisted', 'waitlisted']);
    expect(offerFreeSeats(db, event.id, NOW)).toEqual([]);

    expect(cancelRegistrationByAdmin(db, actor, a.registrationId, 'krank')).toBe(event.id);
    const notices = offerFreeSeats(db, event.id, NOW);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ email: 'b@example.org', priceCents: 20000, locale: 'de' });
    expect(getEventStats(db, event, NOW)).toMatchObject({ offered: 1, seatsFree: 0 });
    expect(offerFreeSeats(db, event.id, NOW)).toEqual([]);
    expect(register('d@example.org', 'invoice').status).toBe('waitlisted');

    const view = getOfferView(db, notices[0].token, NOW)!;
    expect(view).toMatchObject({ state: 'open', paymentMethod: 'invoice', eventSlug: 'summit' });
    expect(acceptOffer(db, notices[0].token, { onlinePaymentEnabled: false, now: NOW })).toMatchObject({ status: 'confirmed' });
    expect(reg(b.registrationId)).toMatchObject({ status: 'confirmed', paymentStatus: 'open' });
    expect(getOfferView(db, notices[0].token, NOW)!.state).toBe('accepted');
    expect(codeOf(() => acceptOffer(db, notices[0].token, { onlinePaymentEnabled: false, now: NOW })).fields).toEqual({ _form: 'offerClosed' });
    void c;
  });

  it('abgelaufenes Angebot → Wartelistenplatz verfällt, nächste Person; Online-Zahlung über die Kasse', async () => {
    const { db, event, register, reg, provider } = setup(1);
    const a = register('a@example.org', 'invoice');
    const b = register('b@example.org', 'invoice', later(1000));
    const c = register('c@example.org', 'stripe', later(2000));
    cancelRegistrationByAdmin(db, actor, a.registrationId, 'x');
    const [offerB] = offerFreeSeats(db, event.id, NOW);
    const after = later(OFFER_VALID_MS + 1000);
    expect(codeOf(() => acceptOffer(db, offerB.token, { onlinePaymentEnabled: true, now: after })).fields).toEqual({ _form: 'offerExpired' });
    expect(expireOffers(db, after)).toEqual([event.id]);
    expect(reg(b.registrationId)).toMatchObject({ status: 'cancelled', cancelReason: 'Wartelisten-Angebot nicht angenommen' });

    const [offerC] = offerFreeSeats(db, event.id, after);
    expect(offerC.email).toBe('c@example.org');
    expect(codeOf(() => acceptOffer(db, offerC.token, { onlinePaymentEnabled: false, now: after })).fields).toEqual({ _form: 'onlinePaymentUnavailable' });
    expect(acceptOffer(db, offerC.token, { onlinePaymentEnabled: true, now: after }).status).toBe('reserved');
    await beginCheckout(db, provider, c.registrationId, { locale: 'de', now: after });
    markCheckoutPaid(db, { sessionId: provider.created[0], paymentIntentId: 'pi', amountCents: 20000 }, after);
    expect(reg(c.registrationId)).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' });
    expect(db.select().from(waitlistOffers).all().map((o) => [o.acceptedAt != null, o.closedAt != null])).toEqual([
      [false, true],
      [true, false],
    ]);
  });

  it('Zeitplan verschickt Angebote per E-Mail mit Link, ohne Angebote doppelt', async () => {
    const { db, event, register } = setup(1);
    const a = register('a@example.org', 'invoice');
    register('b@example.org', 'invoice', later(1000));
    cancelRegistrationByAdmin(db, actor, a.registrationId, 'x');
    const sent: MailMessage[] = [];
    const mailer = async (m: MailMessage) => void sent.push(m);
    expect(await runJobs(db, mailer, NOW)).toEqual({ expiredReservations: 0, expiredOffers: 0, offered: 1, mailFailures: 0 });
    expect(await runJobs(db, mailer, NOW)).toMatchObject({ offered: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('b@example.org');
    expect(sent[0].subject).toBe('Ein Platz ist frei: Summit');
    const token = db.select().from(waitlistOffers).get()!.token;
    expect(sent[0].text).toContain(`/de/offer/${token}`);
    expect(getEvent(db, event.id)).toBeTruthy();
  });
});
