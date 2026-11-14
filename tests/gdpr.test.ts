import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import { pruneBackups } from '@/server/db/backup';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, consents, dsrRequests, invoices, people, registrations, speakers, sponsorContacts } from '@/server/db/schema';
import { createEvent } from '@/server/services/events';
import {
  ANONYMIZED_NAME,
  buildPersonWorkbook,
  completeDsrRequest,
  createDsrRequest,
  dsrDueDate,
  erasePerson,
  liftRestriction,
  listDsrRequests,
  personDataExport,
  restrictPerson,
  searchPeople,
} from '@/server/services/gdpr';
import { issueRegistrationInvoice } from '@/server/services/invoices';
import { publishLegalVersion } from '@/server/services/legal';
import { saveOrganizerSettings } from '@/server/services/organizer';
import { createSpeaker } from '@/server/services/program';
import { registerPublic } from '@/server/services/public-registration';
import { cancelRegistrationByAdmin, listRegistrations } from '@/server/services/registrations';
import { PURGED_RECIPIENT, retentionDue, runRetention } from '@/server/services/retention';
import { createSponsor } from '@/server/services/sponsors';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');
const AFTER_EVENT = new Date('2027-06-01T10:00:00.000Z');

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
  const register = (email: string, options: { method?: 'invoice' | 'stripe' } = {}) => {
    const input: PublicRegistrationInput = {
      firstName: 'Eva',
      lastName: 'Muster',
      email,
      company: 'Muster GmbH',
      locale: 'de',
      memberNumber: null,
      paymentMethod: options.method ?? 'invoice',
      billingCompany: 'Muster GmbH',
      billingAddress: 'Gasse 1, 8010 Graz',
      photoConsent: true,
      termsDocumentId: terms.id,
      privacyDocumentId: privacy.id,
      expectedPriceCents: 20000,
    };
    return registerPublic(db, event.id, input, { stripeEnabled: true, now: NOW }).registrationId;
  };
  const personOf = (email: string) => db.select().from(people).where(eq(people.email, email)).get()!;
  return { db, event, register, personOf };
}

function addSponsorContact(db: Db, eventId: number, email: string) {
  return createSponsor(db, actor, eventId, {
    companyName: 'Acme',
    packageId: null,
    customPriceCents: 100000,
    customVatRateBp: 0,
    discountCents: 0,
    dueOn: null,
    paymentStatus: 'open',
    billingAddress: 'Acme-Straße 1',
    vatId: null,
    notes: null,
    contacts: [{ firstName: 'Max', lastName: 'Kontakt', email, phone: '+43 1', function: 'Marketing', locale: 'de' }],
  } as Parameters<typeof createSponsor>[3]);
}

function codeOf(fn: () => unknown) {
  try {
    fn();
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
  throw new Error('kein Fehler');
}

describe('DSGVO-Suche und Auskunft (D4)', () => {
  it('findet Teilnehmende, Speaker und Sponsor-Kontakte ohne Groß-/Kleinschreibung', () => {
    const { db, event, register } = setup();
    register('eva@example.org');
    createSpeaker(db, actor, event.id, {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.org',
      company: null,
      locale: 'de',
      proposalStatus: 'confirmed',
      slidesStatus: 'missing',
    });
    addSponsorContact(db, event.id, 'max@acme.example');

    expect(searchPeople(db, '  EVA@Example.ORG ').map((p) => p.email)).toEqual(['eva@example.org']);
    expect(searchPeople(db, 'Max@ACME.example')[0]).toMatchObject({ email: 'max@acme.example', sponsorContacts: 1, registrations: 0 });
    expect(searchPeople(db, 'lovelace')[0]).toMatchObject({ email: 'ada@example.org', speakers: 1 });
    expect(searchPeople(db, 'ada lovelace')).toHaveLength(1);
    expect(searchPeople(db, 'x')).toEqual([]); // zu kurz
  });

  it('Auskunft enthält alle Bereiche, Datumsangaben als ISO-Text, und als Excel', async () => {
    const { db, event, register, personOf } = setup();
    const regId = register('eva@example.org');
    issueRegistrationInvoice(db, actor, regId, NOW);
    // dieselbe Person ist auch Speaker und Sponsor-Kontakt
    createSpeaker(db, actor, event.id, {
      firstName: 'Eva',
      lastName: 'Muster',
      email: 'eva@example.org',
      company: null,
      locale: 'de',
      proposalStatus: 'confirmed',
      slidesStatus: 'missing',
    });
    addSponsorContact(db, event.id, 'eva@example.org');
    const id = personOf('eva@example.org').id;
    createDsrRequest(db, actor, { personId: id, type: 'access', receivedAt: '2027-01-20', notes: null }, NOW);

    const data = personDataExport(db, id, NOW)!;
    expect(data.person[0]).toMatchObject({ email: 'eva@example.org' });
    expect(data.registrations[0]).toMatchObject({ event: 'Summit', billingAddress: 'Gasse 1, 8010 Graz', priceEur: 200 });
    expect(data.consents.map((c) => c.kind).sort()).toEqual(['photo', 'privacy', 'terms']);
    expect(data.speakers).toHaveLength(1);
    expect(data.sponsorContacts[0]).toMatchObject({ sponsor: 'Acme', event: 'Summit', function: 'Marketing' });
    expect(data.invoices[0]).toMatchObject({ recipientName: 'Eva Muster', grossEur: 200 });
    expect(data.requests[0]).toMatchObject({ type: 'access', dueOn: '2027-02-20' });
    expect(data.auditLog.length).toBeGreaterThan(0);
    // keine Objekte im Export: alle Werte sind Text, Zahl, Wahrheitswert oder leer
    for (const rows of Object.values(data).filter(Array.isArray)) {
      for (const row of rows as Record<string, unknown>[]) {
        for (const v of Object.values(row)) expect(['string', 'number', 'boolean'].includes(typeof v) || v === null).toBe(true);
      }
    }
    const xlsx = await buildPersonWorkbook(data, 'de');
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
    expect(personDataExport(db, 9999)).toBeNull();
  });
});

describe('Einschränken und Löschen (D5)', () => {
  it('Einschränken sperrt Exporte und erledigt offene Einschränkungs-Anfragen', () => {
    const { db, event, register, personOf } = setup();
    register('eva@example.org');
    const id = personOf('eva@example.org').id;
    const req = createDsrRequest(db, actor, { personId: id, type: 'restriction', receivedAt: '2027-01-30', notes: 'per Mail' }, NOW);
    restrictPerson(db, actor, id, NOW);
    expect(personOf('eva@example.org').restrictedAt).toBe(NOW.toISOString());
    expect(listRegistrations(db, event.id)[0].restricted).toBe(true);
    expect(db.select().from(dsrRequests).where(eq(dsrRequests.id, req)).get()).toMatchObject({ completedAt: NOW.toISOString(), handledBy: 'admin-1' });
    liftRestriction(db, actor, id, NOW);
    expect(personOf('eva@example.org').restrictedAt).toBeNull();
  });

  it('Löschen nur ohne laufende Anmeldung; Rechnung bleibt mit Empfänger erhalten', () => {
    const { db, event, register, personOf } = setup();
    const regId = register('eva@example.org');
    const inv = issueRegistrationInvoice(db, actor, regId, NOW);
    addSponsorContact(db, event.id, 'eva@example.org');
    const id = personOf('eva@example.org').id;
    createDsrRequest(db, actor, { personId: id, type: 'erasure', receivedAt: '2027-01-30', notes: null }, NOW);

    expect(codeOf(() => erasePerson(db, actor, id, NOW))).toEqual({ code: 'CONFLICT', fields: { _form: 'gdprActiveRegistrations' } });

    const result = erasePerson(db, actor, id, AFTER_EVENT);
    expect(result).toMatchObject({ registrations: 1, consents: 3, sponsorContacts: 1, retainedInvoices: 1 });
    const person = db.select().from(people).where(eq(people.id, id)).get()!;
    expect(person).toMatchObject({ firstName: '', lastName: ANONYMIZED_NAME, email: null, company: null, phone: null });
    expect(person.anonymizedAt).toBe(AFTER_EVENT.toISOString());
    expect(person.restrictedAt).not.toBeNull();
    const reg = db.select().from(registrations).where(eq(registrations.id, regId)).get()!;
    expect(reg).toMatchObject({ billingAddress: null, billingCompany: null, priceCents: 20000 });
    expect(reg.qrToken.startsWith('anon-')).toBe(true);
    expect(db.select().from(consents).where(eq(consents.personId, id)).all()).toEqual([]);
    expect(db.select().from(sponsorContacts).where(eq(sponsorContacts.personId, id)).all()).toEqual([]);
    // Beleg unverändert (§ 132 BAO)
    expect(db.select().from(invoices).where(eq(invoices.id, inv.id)).get()!.recipient).toMatchObject({ name: 'Eva Muster', address: 'Gasse 1, 8010 Graz' });
    expect(listDsrRequests(db, { personId: id })[0].completedAt).toBe(AFTER_EVENT.toISOString());
    expect(codeOf(() => erasePerson(db, actor, id, AFTER_EVENT)).fields).toEqual({ _form: 'gdprAnonymized' });
    // Audit ohne Personendaten
    const entry = db.select().from(auditLog).where(eq(auditLog.action, 'person.anonymized')).get()!;
    expect(entry.summary).not.toContain('Eva');
  });
});

describe('Anfragen Betroffener (D7)', () => {
  it('Frist ein Monat, überfällig markiert, erledigen', () => {
    expect(dsrDueDate('2027-01-31')).toBe('2027-02-28');
    expect(dsrDueDate('2027-03-15T09:00:00.000Z')).toBe('2027-04-15');
    expect(dsrDueDate('2027-12-10')).toBe('2028-01-10');
    const { db } = setup();
    const id = createDsrRequest(db, actor, { personId: null, type: 'access', receivedAt: '2026-12-20', notes: 'Unbekannte Adresse' }, NOW);
    expect(listDsrRequests(db, {}, NOW)[0]).toMatchObject({ id, overdue: true, personName: null, dueOn: '2027-01-20' });
    expect(codeOf(() => createDsrRequest(db, actor, { personId: null, type: 'access', receivedAt: '2027-02-02', notes: null }, NOW)).fields).toEqual({
      receivedAt: 'notInFuture',
    });
    completeDsrRequest(db, actor, id, NOW);
    expect(listDsrRequests(db, { openOnly: true }, NOW)).toEqual([]);
  });
});

describe('Löschlauf (D6)', () => {
  it('Probelauf ändert nichts', () => {
    const { db, register } = setup();
    register('eva@example.org');
    const later = new Date('2028-01-01T00:00:00.000Z');
    const s = runRetention(db, { now: later, dryRun: true });
    expect(s.anonymizedPeople).toBe(1);
    expect(db.select().from(people).all()[0].email).toBe('eva@example.org');
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'retention.run')).all()).toEqual([]);
  });

  it('wendet die Fristen an: unbezahlte Stornos, 6 Monate, Geschäftskontakte, Waisen, Belege, Protokoll', () => {
    const { db, event, register, personOf } = setup();
    const paid = register('eva@example.org');
    const inv = issueRegistrationInvoice(db, actor, paid, NOW);
    // Speaker, der sich auch angemeldet hat: Geschäftskontakt, bleibt länger
    register('speaker@example.org');
    createSpeaker(db, actor, event.id, {
      firstName: 'Eva',
      lastName: 'Muster',
      email: 'speaker@example.org',
      company: null,
      locale: 'de',
      proposalStatus: 'confirmed',
      slidesStatus: 'missing',
    });
    const cancelled = register('storno@example.org', { method: 'stripe' });
    cancelRegistrationByAdmin(db, actor, cancelled, 'Test');
    // Person ohne Bezug (z. B. Speaker wieder entfernt)
    db.insert(people).values({ firstName: 'Lose', lastName: 'Person', email: 'lose@example.org', createdAt: '2027-01-01T00:00:00.000Z' }).run();
    db.insert(auditLog).values({ at: '2024-01-01T00:00:00.000Z', action: 'x.y', entity: 'event', summary: 'alt' }).run();

    // 31 Tage nach dem Event: Storno ohne Zahlung gelöscht, danach sind storno@ und lose@ ohne Bezug
    const month = new Date('2027-06-13T10:00:00.000Z');
    expect(retentionDue(db, month)).toBe(true);
    const s1 = runRetention(db, { now: month });
    expect(s1).toMatchObject({ deletedRegistrations: 1, anonymizedPeople: 0, deletedPeople: 2, purgedInvoices: 0, deletedAuditEntries: 1 });
    expect(db.select().from(registrations).where(eq(registrations.id, cancelled)).get()).toBeUndefined();
    expect(retentionDue(db, month)).toBe(false);

    // 6 Monate nach dem Event: Eva wird anonymisiert, der Speaker bleibt
    const half = new Date('2027-11-13T10:00:00.000Z');
    const s2 = runRetention(db, { now: half });
    expect(s2).toMatchObject({ anonymizedPeople: 1, keptAsBusinessContact: 1, deletedPeople: 0 });
    expect(personOf('speaker@example.org').anonymizedAt).toBeNull();
    expect(db.select().from(invoices).where(eq(invoices.id, inv.id)).get()!.recipient.name).toBe('Eva Muster');

    // nach Ablauf der Aufbewahrungsfrist (31.12.2034): Empfänger geleert, nur einmal
    const late = new Date('2035-01-02T10:00:00.000Z');
    expect(runRetention(db, { now: late }).purgedInvoices).toBe(1);
    expect(db.select().from(invoices).where(eq(invoices.id, inv.id)).get()).toMatchObject({
      recipient: { name: PURGED_RECIPIENT, address: '', email: null },
      grossCents: 20000,
    });
    expect(runRetention(db, { now: late }).purgedInvoices).toBe(0);
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'retention.run')).all().length).toBeGreaterThan(0);
  });

  it('Speaker und Sponsor-Kontakte erst 3 Jahre nach dem letzten Event anonymisiert, Speaker-Eintrag bleibt', () => {
    const { db, event } = setup();
    const sp = createSpeaker(db, actor, event.id, {
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.org',
      company: null,
      locale: 'de',
      proposalStatus: 'confirmed',
      slidesStatus: 'missing',
    });
    addSponsorContact(db, event.id, 'max@acme.example');
    expect(runRetention(db, { now: new Date('2027-11-13T10:00:00.000Z') })).toMatchObject({ anonymizedPeople: 0, keptAsBusinessContact: 2 });
    expect(runRetention(db, { now: new Date('2030-05-11T10:00:00.000Z') }).anonymizedPeople).toBe(0);
    expect(runRetention(db, { now: new Date('2030-05-13T10:00:00.000Z') }).anonymizedPeople).toBe(2);
    const row = db.select().from(speakers).where(eq(speakers.id, sp)).get()!;
    expect(db.select().from(people).where(eq(people.id, row.personId)).get()).toMatchObject({ email: null, lastName: ANONYMIZED_NAME });
  });

  it('löscht Sicherungen älter als 90 Tage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backups-'));
    const old = path.join(dir, 'eventflow-alt.db');
    const fresh = path.join(dir, 'eventflow-neu.db');
    fs.writeFileSync(old, '');
    fs.writeFileSync(fresh, '');
    fs.writeFileSync(path.join(dir, 'notiz.txt'), '');
    const now = new Date();
    const past = new Date(now.getTime() - 91 * 24 * 3600 * 1000);
    fs.utimesSync(old, past, past);
    fs.utimesSync(path.join(dir, 'notiz.txt'), past, past);
    expect(pruneBackups(dir, 90, { now, dryRun: true })).toBe(1);
    expect(fs.existsSync(old)).toBe(true);
    expect(pruneBackups(dir, 90, { now })).toBe(1);
    expect(fs.readdirSync(dir).sort()).toEqual(['eventflow-neu.db', 'notiz.txt']);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
