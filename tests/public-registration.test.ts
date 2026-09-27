import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { publicRegistrationSchema, toPublicRegistrationInput, type PublicRegistrationInput } from '@/lib/validation/public-registration';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, consents, people, registrationRoles, registrations } from '@/server/db/schema';
import { createEvent, getEvent, getEventStats, setEventArchived, updateEvent, type EventRow } from '@/server/services/events';
import { publishLegalVersion } from '@/server/services/legal';
import { replaceMembers } from '@/server/services/members';
import { upsertPerson } from '@/server/services/people';
import { getAvailability, listPublicEvents, listPublicSessions, listPublicSpeakers } from '@/server/services/public-events';
import { quotePrice, registerPublic } from '@/server/services/public-registration';
import { createSession, createSpeaker } from '@/server/services/program';
import { clientIp, resetRateLimits, takeToken } from '@/server/rate-limit';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');

type EventOverrides = Partial<Parameters<typeof createEvent>[2]>;

function eventInput(o: EventOverrides = {}): Parameters<typeof createEvent>[2] {
  return {
    slug: 'summit',
    name: { de: 'Summit' },
    description: null,
    location: 'Wien',
    startsAt: '2027-05-12T06:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: 2,
    priceNormalCents: 20000,
    priceMemberCents: 15000,
    ticketVatRateBp: 2000,
    allowStripe: true,
    allowInvoice: true,
    refundMode: 'automatic',
    cancellationRules: [],
    ...o,
  };
}

function setup(o: EventOverrides = {}) {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const event = createEvent(db, actor, eventInput(o));
  const terms = publishLegalVersion(db, actor, 'terms', event.id, { de: 'AGB' });
  const privacy = publishLegalVersion(db, actor, 'privacy', null, { de: 'Datenschutz' });
  replaceMembers(db, actor, [{ memberNumber: 'M-100', lastName: 'Gruber', firstName: 'Eva', email: null, validUntil: '2027-12-31' }], 'm.csv');
  const input = (x: Partial<PublicRegistrationInput> = {}): PublicRegistrationInput => ({
    firstName: 'Eva',
    lastName: 'Gruber',
    email: 'eva@example.org',
    company: null,
    locale: 'de',
    memberNumber: null,
    paymentMethod: 'invoice',
    billingCompany: 'Gruber KG',
    billingAddress: 'Ring 1, 1010 Wien',
    photoConsent: false,
    newsletter: false,
    termsDocumentId: terms.id,
    privacyDocumentId: privacy.id,
    expectedPriceCents: 20000,
    ...x,
  });
  const reg = (x: Partial<PublicRegistrationInput> = {}, stripeEnabled = false, now = NOW) =>
    registerPublic(db, event.id, input(x), { stripeEnabled, now });
  return { db, event, terms, privacy, input, reg };
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

const reload = (db: Db, e: EventRow) => getAvailability(db, getEvent(db, e.id)!, false, NOW);

describe('Formular', () => {
  it('verlangt AGB, Datenschutz und bei Rechnung Firma + Adresse', () => {
    const base = {
      firstName: 'Eva', lastName: 'Gruber', email: ' Eva@Example.org ', company: '', memberNumber: '', paymentMethod: 'invoice',
      billingCompany: '', billingAddress: '', acceptTerms: false, acceptPrivacy: false, photoConsent: false, newsletter: false, website: '',
    };
    const r = publicRegistrationSchema.safeParse(base);
    const msgs = Object.fromEntries(r.error!.issues.map((i) => [i.path.join('.'), i.message]));
    expect(msgs).toEqual({ acceptTerms: 'termsRequired', acceptPrivacy: 'privacyRequired', billingCompany: 'requiredForInvoice', billingAddress: 'requiredForInvoice' });
    const ok = publicRegistrationSchema.parse({ ...base, paymentMethod: 'stripe', acceptTerms: true, acceptPrivacy: true, billingCompany: 'X' });
    const input = toPublicRegistrationInput(ok, { eventId: 1, termsDocumentId: 1, privacyDocumentId: 2, expectedPriceCents: 0, locale: 'en' });
    expect(input).toMatchObject({ email: 'eva@example.org', company: null, billingCompany: null, paymentMethod: 'stripe', locale: 'en' });
  });
});

describe('Preis', () => {
  it('Mitgliedspreis nur bei passender Nummer und Nachname', () => {
    const { db, event } = setup();
    expect(quotePrice(db, event, null, 'Gruber', NOW)).toMatchObject({ priceCents: 20000, memberCheck: 'none' });
    expect(quotePrice(db, event, ' m-100 ', 'gruber', NOW)).toMatchObject({ priceCents: 15000, ticketType: 'member', memberCheck: 'valid' });
    expect(quotePrice(db, event, 'M-100', 'Huber', NOW)).toMatchObject({ priceCents: 20000, memberCheck: 'invalid' });
    expect(quotePrice(db, event, 'M-100', 'Gruber', new Date('2028-01-02T10:00:00Z')).memberCheck).toBe('invalid');
  });

  it('bricht ab, wenn der angezeigte Preis nicht dem Serverpreis entspricht', () => {
    const { reg } = setup();
    expect(codeOf(() => reg({ memberNumber: 'M-100', lastName: 'Huber', expectedPriceCents: 15000 }))).toEqual({ code: 'CONFLICT', fields: { _form: 'priceChanged' } });
    const r = reg({ memberNumber: 'M-100', expectedPriceCents: 15000 });
    expect(r).toMatchObject({ status: 'confirmed', ticketType: 'member', priceCents: 15000, memberCheck: 'valid' });
  });
});

describe('Anmeldung', () => {
  it('Rechnung: sofort bestätigt, Zahlung offen, Rolle, Zustimmungen und Audit ohne Personendaten', () => {
    const { db, event, terms, privacy, reg } = setup();
    const r = reg({ photoConsent: true });
    expect(r).toMatchObject({ status: 'confirmed', paymentMethod: 'invoice', priceCents: 20000, reservedUntil: null });
    const row = db.select().from(registrations).get()!;
    expect(row).toMatchObject({ source: 'public', paymentStatus: 'open', billingCompany: 'Gruber KG', confirmedAt: NOW.toISOString() });
    expect(db.select().from(registrationRoles).all()).toHaveLength(1);
    const c = db.select().from(consents).all().map((x) => [x.kind, x.documentId, x.eventId, x.source]);
    expect(c).toEqual([
      ['terms', terms.id, event.id, 'public'],
      ['privacy', privacy.id, event.id, 'public'],
      ['photo', null, event.id, 'public'],
    ]);
    const audit = db.select().from(auditLog).all().at(-1)!;
    expect(audit).toMatchObject({ action: 'registration.created', actorUserId: null });
    expect(audit.summary).not.toMatch(/eva|gruber/i);
  });

  it('Stripe: 30 Minuten reserviert – nur wenn Stripe eingerichtet ist', () => {
    const { reg } = setup();
    expect(codeOf(() => reg({ paymentMethod: 'stripe' }, false))).toEqual({ code: 'INVALID', fields: { paymentMethod: 'choosePaymentMethod' } });
    const r = reg({ paymentMethod: 'stripe' }, true);
    expect(r).toMatchObject({ status: 'reserved', paymentMethod: 'stripe', reservedUntil: '2027-02-01T10:30:00.000Z' });
  });

  it('kostenlos: keine Zahlungsart nötig', () => {
    const { reg } = setup({ priceNormalCents: 0, priceMemberCents: 0, allowStripe: false, allowInvoice: false });
    expect(reg({ paymentMethod: null, expectedPriceCents: 0 })).toMatchObject({ status: 'confirmed', paymentMethod: 'free', priceCents: 0 });
  });

  it('Rechnung ohne Firma/Adresse wird abgelehnt', () => {
    const { reg } = setup();
    expect(codeOf(() => reg({ billingCompany: null, billingAddress: null }))).toEqual({
      code: 'INVALID',
      fields: { billingCompany: 'requiredForInvoice', billingAddress: 'requiredForInvoice' },
    });
  });

  it('keine Doppelanmeldung; bestehende Person wird wiederverwendet, aber nicht überschrieben', () => {
    const { db, reg } = setup({ capacity: 5 });
    upsertPerson(db, { firstName: 'Eva', lastName: 'Gruber', email: 'eva@example.org', company: null, locale: 'de' });
    reg({ firstName: 'Mallory', company: 'Neu GmbH' });
    const p = db.select().from(people).all();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ firstName: 'Eva', company: 'Neu GmbH' });
    expect(codeOf(() => reg())).toEqual({ code: 'CONFLICT', fields: { email: 'emailAlreadyRegistered' } });
  });

  it('volles Event → Warteliste; solange jemand wartet, auch bei frei werdendem Platz', () => {
    const { db, event, reg } = setup({ capacity: 1 });
    expect(reg({ email: 'a@example.org' }).status).toBe('confirmed');
    expect(reg({ email: 'b@example.org' })).toMatchObject({ status: 'waitlisted', paymentMethod: 'invoice' });
    db.update(registrations).set({ status: 'cancelled' }).where(eq(registrations.status, 'confirmed')).run();
    expect(getEventStats(db, event, NOW).seatsFree).toBe(1);
    expect(reload(db, event)).toMatchObject({ waitlistOnly: true, seatsFree: 0 });
    expect(reg({ email: 'c@example.org' }).status).toBe('waitlisted');
  });

  it('nur bei offener Anmeldung und mit aktuellen AGB/Datenschutz', () => {
    const { db, event, input, reg } = setup();
    expect(codeOf(() => reg({ termsDocumentId: 999 }))).toEqual({ code: 'CONFLICT', fields: { _form: 'legalChanged' } });
    publishLegalVersion(db, actor, 'privacy', null, { de: 'neu' });
    expect(codeOf(() => reg())).toEqual({ code: 'CONFLICT', fields: { _form: 'legalChanged' } });
    expect(codeOf(() => registerPublic(db, event.id, input(), { stripeEnabled: false, now: new Date('2027-05-12T07:00:00Z') })).fields).toEqual({
      _form: 'registrationClosed',
    });
    setEventArchived(db, actor, event.id, true);
    expect(codeOf(() => reg()).code).toBe('NOT_FOUND');
  });
});

describe('Öffentliche Sicht', () => {
  it('Verfügbarkeit: ohne AGB oder Zahlungsart nicht anmeldbar', () => {
    const { db, event } = setup();
    expect(reload(db, event)).toMatchObject({ state: 'open', paymentMethods: ['invoice'], waitlistOnly: false, seatsFree: 2 });
    expect(getAvailability(db, getEvent(db, event.id)!, true, NOW).paymentMethods).toEqual(['stripe', 'invoice']);
    const e2 = updateEvent(db, actor, event.id, { ...eventInput(), allowInvoice: false });
    expect(getAvailability(db, e2, false, NOW).state).toBe('unavailable');
    const other = createEvent(db, actor, eventInput({ slug: 'ohne-agb' }));
    expect(reload(db, other).state).toBe('unavailable');
  });

  it('listet kommende Events; Speaker nur mit bestätigtem Beitrag', () => {
    const { db, event } = setup();
    createEvent(db, actor, eventInput({ slug: 'vorbei', startsAt: '2026-01-01T08:00:00.000Z', endsAt: '2026-01-01T10:00:00.000Z' }));
    expect(listPublicEvents(db, NOW).map((e) => e.slug)).toEqual(['summit']);
    const s1 = createSpeaker(db, actor, event.id, { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.org', company: null, locale: 'en', proposalStatus: 'confirmed', slidesStatus: 'missing' });
    const s2 = createSpeaker(db, actor, event.id, { firstName: 'Bob', lastName: 'Offen', email: 'bob@example.org', company: null, locale: 'de', proposalStatus: 'pending', slidesStatus: 'missing' });
    const base = { startsAt: '2027-05-12T07:00:00.000Z', endsAt: '2027-05-12T07:30:00.000Z', location: '', tag: 'talk' as const };
    createSession(db, actor, event.id, { ...base, title: { de: 'A' }, stream: 1, speakerId: s1 });
    createSession(db, actor, event.id, { ...base, title: { de: 'B' }, stream: 2, speakerId: s2 });
    expect(listPublicSessions(db, event.id).map((s) => s.speakerName)).toEqual(['Ada Lovelace', null]);
    expect(listPublicSpeakers(db, event.id)).toEqual([{ name: 'Ada Lovelace', company: null }]);
  });
});

describe('Anfragebegrenzung', () => {
  it('sperrt nach dem Limit und gibt nach dem Zeitfenster wieder frei', () => {
    resetRateLimits();
    const limit = { limit: 2, windowMs: 1000 };
    expect(takeToken('k', limit, 0)).toBe(true);
    expect(takeToken('k', limit, 10)).toBe(true);
    expect(takeToken('k', limit, 20)).toBe(false);
    expect(takeToken('anders', limit, 20)).toBe(true);
    expect(takeToken('k', limit, 1001)).toBe(true);
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
