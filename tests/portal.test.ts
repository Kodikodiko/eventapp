import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import { upsertAdmin } from '@/server/auth/admin-users';
import { createAuth } from '@/server/auth/config';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, authUsers, authVerifications, people, registrations } from '@/server/db/schema';
import { createEvent } from '@/server/services/events';
import { issueRegistrationInvoice } from '@/server/services/invoices';
import { publishLegalVersion } from '@/server/services/legal';
import { saveOrganizerSettings } from '@/server/services/organizer';
import {
  ensurePortalAccount,
  ownInvoice,
  ownRegistration,
  portalCancelQuote,
  portalCanCancel,
  portalLinkRecipient,
  portalOverview,
  updateOwnPerson,
} from '@/server/services/portal';
import { registerPublic } from '@/server/services/public-registration';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');
const BASE = 'http://localhost:3000';

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  saveOrganizerSettings(db, actor, {
    name: 'Verein',
    address: 'Platz 1, 8010 Graz',
    vatId: null,
    iban: null,
    bic: null,
    contactEmail: null,
    vatMode: 'small_business',
    smallBusinessNote: null,
    invoicePaymentTermDays: 14,
  });
  const event = createEvent(db, actor, {
    slug: 'summit',
    name: { de: 'Summit' },
    description: null,
    location: 'Graz',
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
    cancellationRules: [{ daysBeforeEvent: 30, refundPercent: 100 }],
  });
  const terms = publishLegalVersion(db, actor, 'terms', event.id, { de: 'AGB' });
  const privacy = publishLegalVersion(db, actor, 'privacy', null, { de: 'DS' });
  const register = (email: string) => {
    const input: PublicRegistrationInput = {
      firstName: 'Eva',
      lastName: 'Muster',
      email,
      company: null,
      locale: 'de',
      memberNumber: null,
      paymentMethod: 'invoice',
      billingCompany: 'Firma',
      billingAddress: 'Adresse',
      photoConsent: false,
      newsletter: false,
      termsDocumentId: terms.id,
      privacyDocumentId: privacy.id,
      expectedPriceCents: 20000,
    };
    return registerPublic(db, event.id, input, { stripeEnabled: true, now: NOW }).registrationId;
  };
  const links: { email: string; url: string }[] = [];
  const auth = createAuth(db, {
    secret: 'test-secret-'.padEnd(48, 'x'),
    baseURL: BASE,
    sendPortalLink: async ({ email, url }) => {
      if (portalLinkRecipient(db, email)) links.push({ email, url });
    },
  });
  const personId = (email: string) => db.select().from(people).where(eq(people.email, email)).get()!.id;
  return { db, event, register, auth, links, personId };
}

const headers = () => new Headers({ origin: BASE });

function cookieHeader(response: Response): Headers {
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => !c.endsWith('='));
  return new Headers({ cookie: cookies.join('; ') });
}

describe('Portal-Konten', () => {
  it('nur für Personen mit Anmeldung, nicht eingeschränkt, nie für Admins', async () => {
    const { db, register } = setup();
    expect(ensurePortalAccount(db, 'niemand@example.org')).toBeNull();
    register('eva@example.org');
    const account = ensurePortalAccount(db, ' Eva@Example.org ');
    expect(account).toMatchObject({ email: 'eva@example.org', locale: 'de' });
    expect(db.select().from(authUsers).where(eq(authUsers.email, 'eva@example.org')).get()).toMatchObject({ role: 'attendee', emailVerified: false });
    expect(ensurePortalAccount(db, 'eva@example.org')?.userId).toBe(account!.userId); // kein zweites Konto

    await upsertAdmin(db, { email: 'admin@example.org', name: 'Admin', password: 'ein-sehr-geheimes-passwort' });
    register('admin@example.org'); // Admin hat sich zusätzlich als Teilnehmer angemeldet
    expect(ensurePortalAccount(db, 'admin@example.org')).toBeNull();
    expect(portalLinkRecipient(db, 'admin@example.org')).toBeNull();

    db.update(people).set({ restrictedAt: NOW.toISOString() }).where(eq(people.email, 'eva@example.org')).run();
    expect(ensurePortalAccount(db, 'eva@example.org')).toBeNull();
    expect(portalLinkRecipient(db, 'eva@example.org')).toBeNull();
  });

  it('Anmeldung per Link: Sitzung als Teilnehmer:in, Link nur einmal gültig', async () => {
    const { db, register, auth, links, personId } = setup();
    register('eva@example.org');
    ensurePortalAccount(db, 'eva@example.org');
    await auth.api.signInMagicLink({ body: { email: 'eva@example.org', callbackURL: '/de/portal', errorCallbackURL: '/de/portal/login' }, headers: headers() });
    expect(links).toHaveLength(1);
    const url = new URL(links[0].url);
    expect(url.pathname).toBe('/api/auth/magic-link/verify');
    const query = { token: url.searchParams.get('token')!, callbackURL: '/de/portal', errorCallbackURL: '/de/portal/login' };
    const res = await auth.api.magicLinkVerify({ query, headers: headers(), asResponse: true });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`${BASE}/de/portal`);
    const session = await auth.api.getSession({ headers: cookieHeader(res) });
    expect(session?.user).toMatchObject({ role: 'attendee', personId: personId('eva@example.org'), emailVerified: true });
    const again = await auth.api.magicLinkVerify({ query, headers: headers(), asResponse: true });
    expect(again.headers.get('location')).toContain('/de/portal/login?error=INVALID_TOKEN');
  });

  it('kein Link für Admin-Adressen und keine Selbstregistrierung', async () => {
    const { db, register, auth, links } = setup();
    await upsertAdmin(db, { email: 'admin@example.org', name: 'Admin', password: 'ein-sehr-geheimes-passwort' });
    register('admin@example.org');
    await auth.api.signInMagicLink({ body: { email: 'admin@example.org', callbackURL: '/de/portal' }, headers: headers() });
    await auth.api.signInMagicLink({ body: { email: 'fremd@example.org', callbackURL: '/de/portal' }, headers: headers() });
    expect(links).toHaveLength(0);
    // es wurde gar kein Token erzeugt
    expect(db.select().from(authVerifications).all()).toHaveLength(0);
    expect(db.select().from(authUsers).where(eq(authUsers.email, 'fremd@example.org')).get()).toBeUndefined();
    // Passwort-Anmeldung des Admins funktioniert weiterhin
    const signIn = await auth.api.signInEmail({ body: { email: 'admin@example.org', password: 'ein-sehr-geheimes-passwort' }, asResponse: true });
    expect(signIn.status).toBe(200);
  });
});

describe('Portal-Inhalte', () => {
  it('zeigt nur eigene Anmeldungen und Belege', () => {
    const { db, register, personId } = setup();
    const own = register('eva@example.org');
    const other = register('max@example.org');
    const ownInv = issueRegistrationInvoice(db, actor, own, NOW);
    const otherInv = issueRegistrationInvoice(db, actor, other, NOW);
    const eva = personId('eva@example.org');
    const view = portalOverview(db, eva, NOW);
    expect(view.registrations.map((r) => r.id)).toEqual([own]);
    expect(view.registrations[0]).toMatchObject({ canCancel: true, documents: [{ number: ownInv.number, type: 'invoice', cancelled: false }] });
    expect(ownInvoice(db, eva, ownInv.id)?.id).toBe(ownInv.id);
    expect(ownInvoice(db, eva, otherInv.id)).toBeUndefined();
    expect(() => ownRegistration(db, eva, other)).toThrow(ServiceError);
  });

  it('Storno nur vor Beginn und für bestätigte/wartende Anmeldungen; Vorschau der Erstattung', () => {
    const { db, register, personId } = setup();
    const id = register('eva@example.org');
    const event = { startsAt: '2027-05-12T06:00:00.000Z', archivedAt: null };
    expect(portalCanCancel({ status: 'confirmed' }, event, NOW)).toBe(true);
    expect(portalCanCancel({ status: 'waitlisted' }, event, NOW)).toBe(true);
    expect(portalCanCancel({ status: 'cancelled' }, event, NOW)).toBe(false);
    expect(portalCanCancel({ status: 'confirmed' }, event, new Date('2027-05-12T07:00:00.000Z'))).toBe(false);
    expect(portalCanCancel({ status: 'confirmed' }, { ...event, archivedAt: '2027-01-01' }, NOW)).toBe(false);
    issueRegistrationInvoice(db, actor, id, NOW);
    expect(portalCancelQuote(db, personId('eva@example.org'), id, NOW)).toMatchObject({ rulePercent: 100, amounts: { creditCents: 20000, refundCents: 0, openCents: 0 } });
    db.update(registrations).set({ status: 'cancelled' }).where(eq(registrations.id, id)).run();
    expect(() => portalCancelQuote(db, personId('eva@example.org'), id, NOW)).toThrow(ServiceError);
  });

  it('eigene Stammdaten ändern (ohne E-Mail), mit Protokoll', () => {
    const { db, register, personId } = setup();
    register('eva@example.org');
    const account = ensurePortalAccount(db, 'eva@example.org')!;
    updateOwnPerson(db, { userId: account.userId }, account.personId, { firstName: 'Eva-Maria', lastName: 'Muster', company: 'Neu GmbH', phone: null, locale: 'en' });
    expect(db.select().from(people).where(eq(people.id, personId('eva@example.org'))).get()).toMatchObject({ firstName: 'Eva-Maria', company: 'Neu GmbH', locale: 'en', email: 'eva@example.org' });
    expect(db.select().from(authUsers).where(eq(authUsers.id, account.userId)).get()!.name).toBe('Eva-Maria Muster');
    const audit = db.select().from(auditLog).where(eq(auditLog.action, 'person.self_updated')).get()!;
    expect(audit).toMatchObject({ actorUserId: account.userId, summary: 'Stammdaten im Portal geändert: firstName, company, locale' });
  });
});
