import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { computeTicketPrice, discountAmount } from '@/lib/pricing';
import { discountCodeFormSchema, toDiscountCodeInput } from '@/lib/validation/pricing';
import { eventFormSchema } from '@/lib/validation/forms';
import { emptyEventFormValues } from '@/lib/validation/event-values';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import { openDatabase, type Db } from '@/server/db/core';
import { registrations } from '@/server/db/schema';
import { cancelRegistrationByAdmin, createRegistrationByAdmin, updateRegistrationByAdmin } from '@/server/services/registrations';
import { copyEvent, createEvent } from '@/server/services/events';
import { issueRegistrationInvoice } from '@/server/services/invoices';
import { publishLegalVersion } from '@/server/services/legal';
import { replaceMembers } from '@/server/services/members';
import { saveOrganizerSettings } from '@/server/services/organizer';
import { getPnl } from '@/server/services/pnl';
import {
  createDiscountCode,
  createPriceCategory,
  deleteDiscountCode,
  deletePriceCategory,
  listDiscountCodes,
  listPriceCategories,
  updateDiscountCode,
  updatePriceCategory,
} from '@/server/services/pricing';
import { quotePrice, registerPublic } from '@/server/services/public-registration';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');
const EB = {
  earlyBirdStartsAt: null,
  earlyBirdEndsAt: '2027-03-01T00:00:00.000Z',
  priceEarlyNormalCents: 16000,
  priceEarlyMemberCents: 12000,
};

function code(fn: () => unknown) {
  try {
    fn();
    return { code: 'OK' };
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
}

function setup(earlyBird: Partial<typeof EB> | null = null) {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  saveOrganizerSettings(db, actor, {
    name: 'Verein Beispiel',
    address: 'Hauptplatz 1\n8010 Graz',
    vatId: null,
    iban: 'AT611904300234573201',
    bic: 'BKAUATWW',
    contactEmail: 'office@verein.example',
    vatMode: 'small_business',
    smallBusinessNote: { de: 'Umsatzsteuerfrei.', en: 'VAT exempt.' },
    invoicePaymentTermDays: 14,
  });
  const event = createEvent(db, actor, {
    slug: 'summit',
    name: { de: 'Summit' },
    description: null,
    location: 'Wien',
    startsAt: '2027-05-12T06:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: 100,
    priceNormalCents: 20000,
    priceMemberCents: 15000,
    ticketVatRateBp: 2000,
    allowStripe: true,
    allowInvoice: true,
    refundMode: 'automatic',
    cancellationRules: [],
    ...(earlyBird ? { ...EB, ...earlyBird } : {}),
  });
  const terms = publishLegalVersion(db, actor, 'terms', event.id, { de: 'AGB' });
  const privacy = publishLegalVersion(db, actor, 'privacy', null, { de: 'Datenschutz' });
  replaceMembers(db, actor, [{ memberNumber: 'M-100', lastName: 'Gruber', firstName: 'Eva', email: null, validUntil: '2027-12-31' }], 'm.csv');
  let n = 0;
  const reg = (x: Partial<PublicRegistrationInput> = {}, now = NOW) =>
    registerPublic(
      db,
      event.id,
      {
        firstName: 'Eva',
        lastName: 'Gruber',
        email: `p${++n}@example.org`,
        company: null,
        locale: 'de',
        memberNumber: null,
        paymentMethod: 'invoice',
        billingCompany: 'Gruber KG',
        billingAddress: 'Ring 1, 1010 Wien',
        photoConsent: false,
        termsDocumentId: terms.id,
        privacyDocumentId: privacy.id,
        expectedPriceCents: 20000,
        ...x,
      },
      { stripeEnabled: false, now }
    );
  const addCode = (o: Partial<Parameters<typeof createDiscountCode>[3]> = {}) =>
    createDiscountCode(db, actor, event.id, {
      code: 'HERBST20',
      kind: 'percent',
      value: 2000,
      validFrom: null,
      validUntil: null,
      maxUses: null,
      active: true,
      note: null,
      ...o,
    });
  return { db, event, reg, addCode };
}

describe('Preisregeln (rein)', () => {
  const event = { priceNormalCents: 20000, priceMemberCents: 15000, ...EB };

  it('Early Bird gilt im Zeitraum, je Tickettyp; ohne Preis kein Early Bird', () => {
    expect(computeTicketPrice(event, 'normal', null, NOW)).toMatchObject({ priceCents: 16000, tier: 'early_bird' });
    expect(computeTicketPrice(event, 'member', null, NOW)).toMatchObject({ priceCents: 12000, tier: 'early_bird' });
    expect(computeTicketPrice(event, 'normal', null, new Date('2027-03-01T00:00:00.000Z'))).toMatchObject({ priceCents: 20000, tier: 'regular' });
    expect(computeTicketPrice({ ...event, earlyBirdStartsAt: '2027-02-10T00:00:00.000Z' }, 'normal', null, NOW).tier).toBe('regular');
    expect(computeTicketPrice({ ...event, priceEarlyMemberCents: null }, 'member', null, NOW)).toMatchObject({ priceCents: 15000, tier: 'regular' });
  });

  it('Rabatt nur auf den Basispreis; ist Early Bird günstiger, gilt Early Bird', () => {
    const late = new Date('2027-04-01T00:00:00.000Z');
    expect(computeTicketPrice(event, 'normal', { kind: 'percent', value: 1000 }, late)).toMatchObject({ priceCents: 18000, discountCents: 2000, listPriceCents: 20000 });
    expect(computeTicketPrice(event, 'member', { kind: 'fixed', value: 5000 }, late)).toMatchObject({ priceCents: 10000, discountCents: 5000 });
    // im Early-Bird-Zeitraum: 20000 − 10 % = 18000 > 16000 → Early Bird
    expect(computeTicketPrice(event, 'normal', { kind: 'percent', value: 1000 }, NOW)).toMatchObject({ priceCents: 16000, tier: 'early_bird', earlyBirdCheaper: true, discountCents: 0 });
    // 20000 − 50 % = 10000 < 16000 → Code
    expect(computeTicketPrice(event, 'normal', { kind: 'percent', value: 5000 }, NOW)).toMatchObject({ priceCents: 10000, tier: 'regular', discountCents: 10000 });
  });

  it('Preis wird nie negativ, Prozent wird gerundet', () => {
    expect(discountAmount('fixed', 99999, 15000)).toBe(15000);
    expect(discountAmount('percent', 3333, 10001)).toBe(3333);
    expect(discountAmount('percent', 10000, 15000)).toBe(15000);
  });

  it('Formular Rabattcode: normalisiert, prüft Prozent und Betrag', () => {
    const base = { code: ' herbst-20 ', kind: 'percent' as const, value: '12,5', validFrom: '', validUntil: '', maxUses: '50', active: true, note: '' };
    expect(toDiscountCodeInput(discountCodeFormSchema.parse(base))).toMatchObject({ code: 'HERBST-20', value: 1250, maxUses: 50 });
    expect(discountCodeFormSchema.safeParse({ ...base, value: '120' }).success).toBe(false);
    expect(discountCodeFormSchema.safeParse({ ...base, code: 'a!' }).success).toBe(false);
    expect(toDiscountCodeInput(discountCodeFormSchema.parse({ ...base, kind: 'fixed', value: '25' })).value).toBe(2500);
  });

  it('Event-Formular: Early Bird braucht Ende und mindestens einen Preis', () => {
    const v = { ...emptyEventFormValues(), slug: 'abc', name: { de: 'A', en: '' }, startsAt: '2027-05-12T08:00', endsAt: '2027-05-12T18:00', priceNormal: '200', priceMember: '150' };
    const issues = (o: object) => (eventFormSchema.safeParse({ ...v, ...o }).error?.issues ?? []).map((i) => `${i.path.join('.')}:${i.message}`);
    expect(issues({})).toEqual([]);
    expect(issues({ priceEarlyNormal: '160' })).toEqual(['earlyBirdEndsAt:earlyBirdEndRequired']);
    expect(issues({ earlyBirdEndsAt: '2027-03-01T00:00' })).toEqual(['priceEarlyNormal:earlyBirdPriceRequired']);
    expect(issues({ earlyBirdEndsAt: '2027-03-01T00:00', priceEarlyMember: '120' })).toEqual([]);
  });
});

describe('Öffentliche Anmeldung mit Early Bird und Rabattcode', () => {
  it('Early Bird: Preis, Stufe und Mitgliedspreis', () => {
    const { db, event, reg } = setup({});
    expect(quotePrice(db, event, null, 'Gruber', NOW)).toMatchObject({ priceCents: 16000, tier: 'early_bird', earlyBirdEndsAt: EB.earlyBirdEndsAt });
    expect(quotePrice(db, event, 'M-100', 'Gruber', NOW)).toMatchObject({ priceCents: 12000, ticketType: 'member', tier: 'early_bird' });
    const r = reg({ expectedPriceCents: 16000 });
    expect(r).toMatchObject({ priceCents: 16000, tier: 'early_bird' });
    expect(db.select().from(registrations).where(eq(registrations.id, r.registrationId)).get()).toMatchObject({ priceTier: 'early_bird', discountCents: 0 });
    // nach dem Stichtag gilt wieder der Normalpreis; ein veralteter Preis wird abgelehnt
    const later = new Date('2027-03-02T10:00:00.000Z');
    expect(code(() => reg({ expectedPriceCents: 16000 }, later))).toEqual({ code: 'CONFLICT', fields: { _form: 'priceChanged' } });
    expect(reg({ expectedPriceCents: 20000 }, later).tier).toBe('regular');
  });

  it('Code wird eingelöst, gespeichert und ins Kontingent gezählt', () => {
    const { db, event, reg, addCode } = setup();
    addCode({ maxUses: 2 });
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'herbst20')).toMatchObject({ priceCents: 16000, discountCents: 4000, code: 'HERBST20', codeStatus: 'valid' });
    expect(quotePrice(db, event, 'M-100', 'Gruber', NOW, 'HERBST20')).toMatchObject({ priceCents: 12000, discountCents: 3000, ticketType: 'member' });
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'FALSCH').codeStatus).toBe('invalid');

    const a = reg({ discountCode: 'herbst20', expectedPriceCents: 16000 });
    expect(a).toMatchObject({ priceCents: 16000, code: 'HERBST20', discountCents: 4000 });
    reg({ discountCode: 'HERBST20', expectedPriceCents: 16000 });
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'HERBST20').codeStatus).toBe('exhausted');
    // Ausgeschöpft: der Server rechnet ohne Code, der angezeigte Preis passt nicht mehr
    expect(code(() => reg({ discountCode: 'HERBST20', expectedPriceCents: 16000 }))).toEqual({ code: 'CONFLICT', fields: { _form: 'priceChanged' } });
    expect(listDiscountCodes(db, event.id)[0].usedCount).toBe(2);
    // Storno gibt die Einlösung frei
    cancelRegistrationByAdmin(db, actor, a.registrationId, 'Test');
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'HERBST20').codeStatus).toBe('valid');
  });

  it('Gültigkeit und Status des Codes', () => {
    const { db, event, addCode } = setup();
    const id = addCode({ validFrom: '2027-02-05T00:00:00.000Z', validUntil: '2027-02-10T00:00:00.000Z' });
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'HERBST20').codeStatus).toBe('notYetValid');
    expect(quotePrice(db, event, null, 'Gruber', new Date('2027-02-06T00:00:00.000Z'), 'HERBST20').codeStatus).toBe('valid');
    expect(quotePrice(db, event, null, 'Gruber', new Date('2027-02-10T00:00:00.000Z'), 'HERBST20').codeStatus).toBe('expired');
    updateDiscountCode(db, actor, id, { code: 'HERBST20', kind: 'fixed', value: 5000, validFrom: null, validUntil: null, maxUses: null, active: false, note: null });
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'HERBST20').codeStatus).toBe('invalid');
  });

  it('Code im Early-Bird-Zeitraum: günstigerer Preis gilt, Code wird dann nicht eingelöst', () => {
    const { db, event, reg, addCode } = setup({});
    addCode({ value: 1000 });
    expect(quotePrice(db, event, null, 'Gruber', NOW, 'HERBST20')).toMatchObject({ priceCents: 16000, tier: 'early_bird', codeStatus: 'earlyBirdCheaper', code: null });
    const r = reg({ discountCode: 'HERBST20', expectedPriceCents: 16000 });
    expect(db.select().from(registrations).where(eq(registrations.id, r.registrationId)).get()).toMatchObject({ discountCodeId: null, priceTier: 'early_bird' });
  });

  it('Rechnung: Ticket zum Listenpreis und Rabatt als eigene Position', () => {
    const { db, reg, addCode } = setup();
    addCode();
    const r = reg({ discountCode: 'HERBST20', expectedPriceCents: 16000 });
    const inv = issueRegistrationInvoice(db, actor, r.registrationId, NOW);
    expect(inv.items.map((i) => [i.description.split('\n')[0], i.grossCents])).toEqual([
      ['Summit – Ticket', 20000],
      ['Rabatt (Code HERBST20)', -4000],
    ]);
    expect(inv.grossCents).toBe(16000);
  });

  it('Rechnung: Early Bird in der Bezeichnung', () => {
    const { db, reg } = setup({});
    const inv = issueRegistrationInvoice(db, actor, reg({ expectedPriceCents: 16000 }).registrationId, NOW);
    expect(inv.items[0].description.split('\n')[0]).toBe('Summit – Ticket (Early Bird)');
  });
});

describe('Codes und Sonderpreis-Kategorien verwalten', () => {
  const person = (email: string) => ({ firstName: 'Max', lastName: 'Muster', email, company: null, locale: 'de' as const, roles: ['attendee'], billingCompany: null, billingAddress: null });

  it('Code eindeutig je Event; eingelöst nicht löschbar und nicht umbenennbar', () => {
    const { db, reg, addCode } = setup();
    const id = addCode();
    expect(code(() => addCode())).toEqual({ code: 'CONFLICT', fields: { code: 'codeTaken' } });
    reg({ discountCode: 'HERBST20', expectedPriceCents: 16000 });
    expect(code(() => deleteDiscountCode(db, actor, id))).toEqual({ code: 'CONFLICT', fields: { _form: 'discountCodeInUse' } });
    expect(code(() => updateDiscountCode(db, actor, id, { code: 'NEU', kind: 'percent', value: 2000, validFrom: null, validUntil: null, maxUses: null, active: true, note: null }))).toEqual({
      code: 'CONFLICT',
      fields: { code: 'codeInUse' },
    });
    const other = addCode({ code: 'FREI' });
    deleteDiscountCode(db, actor, other);
  });

  it('Admin-Anmeldung mit Kategorie: Preis muss passen, inaktive nicht wählbar, verwendete nicht löschbar', () => {
    const { db, event } = setup();
    const cat = createPriceCategory(db, actor, event.id, { name: 'Studierende', priceCents: 5000, active: true });
    expect(code(() => createPriceCategory(db, actor, event.id, { name: 'studierende', priceCents: 1, active: true }))).toEqual({ code: 'CONFLICT', fields: { name: 'duplicateName' } });
    expect(
      code(() => createRegistrationByAdmin(db, actor, event.id, { ...person('a@x.org'), ticketType: 'special', priceCategoryId: cat, priceCents: 4000, status: 'confirmed', overbook: false }))
    ).toEqual({ code: 'INVALID', fields: { price: 'categoryPrice' } });
    const id = createRegistrationByAdmin(db, actor, event.id, { ...person('a@x.org'), ticketType: 'special', priceCategoryId: cat, priceCents: 5000, status: 'confirmed', overbook: false });
    expect(db.select().from(registrations).where(eq(registrations.id, id)).get()?.priceCategoryId).toBe(cat);
    expect(listPriceCategories(db, event.id)[0].usedCount).toBe(1);
    expect(code(() => deletePriceCategory(db, actor, cat))).toEqual({ code: 'CONFLICT', fields: { _form: 'priceCategoryInUse' } });
    updatePriceCategory(db, actor, cat, { name: 'Studierende', priceCents: 5000, active: false });
    expect(
      code(() => createRegistrationByAdmin(db, actor, event.id, { ...person('b@x.org'), ticketType: 'special', priceCategoryId: cat, priceCents: 5000, status: 'confirmed', overbook: false }))
    ).toEqual({ code: 'INVALID', fields: { priceCategoryId: 'invalid' } });
    // Bearbeiten ohne Preisänderung bleibt mit inaktiver Kategorie möglich
    updateRegistrationByAdmin(db, actor, id, { ...person('a@x.org'), ticketType: 'special', priceCategoryId: cat, priceCents: 5000 });
    // anderer Betrag statt Kategorie
    updateRegistrationByAdmin(db, actor, id, { ...person('a@x.org'), ticketType: 'special', priceCategoryId: null, priceCents: 3000 });
    expect(db.select().from(registrations).where(eq(registrations.id, id)).get()).toMatchObject({ priceCategoryId: null, priceCents: 3000 });
  });

  it('Kopie eines Events übernimmt Kategorien und Early-Bird-Preise, nicht Zeitraum und Codes', () => {
    const { db, event, addCode } = setup({});
    createPriceCategory(db, actor, event.id, { name: 'Studierende', priceCents: 5000, active: true });
    addCode();
    const copy = copyEvent(db, actor, event.id, { slug: 'summit-2028', name: { de: 'Summit 2028' } });
    expect(copy).toMatchObject({ earlyBirdEndsAt: null, priceEarlyNormalCents: 16000 });
    expect(listPriceCategories(db, copy.id).map((c) => c.name)).toEqual(['Studierende']);
    expect(listDiscountCodes(db, copy.id)).toEqual([]);
  });
});

describe('Erfolgsrechnung: Tickets nach Preis', () => {
  it('schlüsselt Normal-, Mitglieds- und Sondertickets nach Preis auf', () => {
    const { db, event, reg, addCode } = setup({});
    addCode({ value: 5000 });
    reg({ expectedPriceCents: 16000 });
    reg({ expectedPriceCents: 16000 });
    reg({ discountCode: 'HERBST20', expectedPriceCents: 10000 });
    reg({ expectedPriceCents: 20000 }, new Date('2027-03-05T00:00:00.000Z'));
    reg({ memberNumber: 'M-100', expectedPriceCents: 12000 });
    const cat = createPriceCategory(db, actor, event.id, { name: 'Studierende', priceCents: 5000, active: true });
    createRegistrationByAdmin(db, actor, event.id, {
      firstName: 'S',
      lastName: 'T',
      email: 's@x.org',
      company: null,
      locale: 'de',
      roles: ['attendee'],
      ticketType: 'special',
      priceCategoryId: cat,
      priceCents: 5000,
      billingCompany: null,
      billingAddress: null,
      status: 'confirmed',
      overbook: false,
    });
    const { core } = getPnl(db, event, NOW);
    const variants = Object.fromEntries(core.tickets.map((t) => [t.key, t.variants.map((v) => [v.kind, v.name, v.priceCents, v.count, v.open])]));
    expect(variants.normal).toEqual([
      ['regular', null, 20000, 1, 20000],
      ['early_bird', null, 16000, 2, 32000],
      ['code', 'HERBST20', 10000, 1, 10000],
    ]);
    expect(variants.member).toEqual([['early_bird', null, 12000, 1, 12000]]);
    expect(variants.special).toEqual([['category', 'Studierende', 5000, 1, 5000]]);
  });
});
