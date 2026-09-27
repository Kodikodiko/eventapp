import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { EventInput } from '@/lib/validation/forms';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, people, registrations, sponsorPackages } from '@/server/db/schema';
import {
  copyEvent,
  createEvent,
  getCancellationRules,
  getEventStats,
  listEvents,
  registrationState,
  setEventArchived,
  updateEvent,
} from '@/server/services/events';
import { currentPrivacyNotice, currentTerms, listLegalVersions, publishLegalVersion } from '@/server/services/legal';
import { getOrganizerSettings, saveOrganizerSettings } from '@/server/services/organizer';

const actor = { userId: 'admin-1' };

function db(): Db {
  return openDatabase({ path: ':memory:', log: () => {} });
}

function input(overrides: Partial<EventInput> = {}): EventInput {
  return {
    slug: 'pm-summit-2027',
    name: { de: 'PM Summit 2027' },
    description: null,
    location: 'Wien',
    startsAt: '2027-05-12T07:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: 3,
    priceNormalCents: 14900,
    priceMemberCents: 9900,
    ticketVatRateBp: 2000,
    allowStripe: true,
    allowInvoice: true,
    refundMode: 'automatic',
    cancellationRules: [
      { daysBeforeEvent: 30, refundPercent: 100 },
      { daysBeforeEvent: 0, refundPercent: 0 },
    ],
    ...overrides,
  };
}

function expectServiceError(fn: () => unknown, code: string, field?: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ServiceError);
    expect((e as ServiceError).code).toBe(code);
    if (field) expect((e as ServiceError).fieldErrors).toHaveProperty(field);
    return;
  }
  throw new Error(`Erwarteter Fehler ${code} blieb aus`);
}

function addRegistration(d: Db, eventId: number, status: 'reserved' | 'confirmed' | 'waitlisted' | 'cancelled', reservedUntil?: string) {
  const [p] = d.insert(people).values({ firstName: 'A', lastName: 'B', email: `${randomUUID()}@example.com` }).returning().all();
  d.insert(registrations)
    .values({
      eventId,
      personId: p.id,
      status,
      paymentStatus: 'open',
      paymentMethod: 'stripe',
      priceCents: 14900,
      source: 'public',
      reservedUntil: reservedUntil ?? null,
      qrToken: randomUUID(),
    })
    .run();
}

describe('Events', () => {
  it('werden mit Stornobedingungen und Audit-Eintrag angelegt', () => {
    const d = db();
    const ev = createEvent(d, actor, input());
    expect(ev.slug).toBe('pm-summit-2027');
    expect(getCancellationRules(d, ev.id).map((r) => [r.daysBeforeEvent, r.refundPercent])).toEqual([
      [30, 100],
      [0, 0],
    ]);
    const audit = d.select().from(auditLog).where(eq(auditLog.action, 'event.created')).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe('admin-1');
    expect(audit[0].eventId).toBe(ev.id);
  });

  it('haben eindeutige Kurznamen', () => {
    const d = db();
    createEvent(d, actor, input());
    expectServiceError(() => createEvent(d, actor, input()), 'CONFLICT', 'slug');
  });

  it('werden bearbeitet, Stornobedingungen ersetzt, Änderungen protokolliert', () => {
    const d = db();
    const ev = createEvent(d, actor, input());
    const updated = updateEvent(d, actor, ev.id, input({ capacity: 50, cancellationRules: [{ daysBeforeEvent: 7, refundPercent: 50 }] }));
    expect(updated.capacity).toBe(50);
    expect(getCancellationRules(d, ev.id)).toHaveLength(1);
    const entry = d.select().from(auditLog).where(eq(auditLog.action, 'event.updated')).get();
    expect(entry?.summary).toContain('capacity');
  });

  it('sind archiviert schreibgeschützt und ausgeblendet', () => {
    const d = db();
    const ev = createEvent(d, actor, input());
    setEventArchived(d, actor, ev.id, true);
    expectServiceError(() => updateEvent(d, actor, ev.id, input()), 'ARCHIVED');
    expect(listEvents(d)).toHaveLength(0);
    expect(listEvents(d, { includeArchived: true })).toHaveLength(1);
    expect(registrationState(listEvents(d, { includeArchived: true })[0])).toBe('archived');
    setEventArchived(d, actor, ev.id, false);
    expect(listEvents(d)).toHaveLength(1);
  });

  it('werden als Vorlage kopiert – ohne Anmeldungen', () => {
    const d = db();
    const ev = createEvent(d, actor, input());
    publishLegalVersion(d, actor, 'terms', ev.id, { de: 'AGB' });
    publishLegalVersion(d, actor, 'terms', ev.id, { de: 'AGB neu' });
    d.insert(sponsorPackages).values({ eventId: ev.id, name: { de: 'Gold' }, benefits: { de: ['Logo'] }, priceCents: 100000 }).run();
    addRegistration(d, ev.id, 'confirmed');

    const copy = copyEvent(d, actor, ev.id, { slug: 'pm-summit-2028', name: { de: 'PM Summit 2028' } });
    expect(copy.capacity).toBe(3);
    expect(copy.archivedAt).toBeNull();
    expect(getCancellationRules(d, copy.id)).toHaveLength(2);
    const terms = currentTerms(d, copy.id);
    expect(terms?.version).toBe(1);
    expect(terms?.content.de).toBe('AGB neu');
    expect(d.select().from(sponsorPackages).where(eq(sponsorPackages.eventId, copy.id)).all()).toHaveLength(1);
    expect(getEventStats(d, copy).confirmed).toBe(0);
    expectServiceError(() => copyEvent(d, actor, ev.id, { slug: 'pm-summit-2028', name: { de: 'x' } }), 'CONFLICT');
  });

  it('zählen gültige Reservierungen gegen die Kapazität', () => {
    const d = db();
    const ev = createEvent(d, actor, input({ capacity: 3 }));
    const now = new Date('2027-01-01T12:00:00.000Z');
    addRegistration(d, ev.id, 'confirmed');
    addRegistration(d, ev.id, 'reserved', '2027-01-01T12:30:00.000Z'); // noch gültig
    addRegistration(d, ev.id, 'reserved', '2027-01-01T11:00:00.000Z'); // abgelaufen
    addRegistration(d, ev.id, 'waitlisted');
    addRegistration(d, ev.id, 'cancelled');
    const s = getEventStats(d, ev, now);
    expect(s).toMatchObject({ confirmed: 1, reserved: 2, waitlisted: 1, cancelled: 1, seatsTaken: 2, seatsFree: 1 });
  });
});

describe('Anmeldezeitraum', () => {
  const ev = { archivedAt: null, registrationOpensAt: '2027-02-01T00:00:00.000Z', registrationClosesAt: null, startsAt: '2027-05-12T07:00:00.000Z' };
  it('richtet sich nach Beginn, Ende und Eventstart', () => {
    expect(registrationState(ev, new Date('2027-01-15T00:00:00Z'))).toBe('notOpenYet');
    expect(registrationState(ev, new Date('2027-03-01T00:00:00Z'))).toBe('open');
    expect(registrationState(ev, new Date('2027-05-12T08:00:00Z'))).toBe('closed');
    expect(registrationState({ ...ev, registrationClosesAt: '2027-05-01T00:00:00.000Z' }, new Date('2027-05-02T00:00:00Z'))).toBe('closed');
  });
});

describe('Rechtstexte', () => {
  it('werden versioniert, AGB pro Event', () => {
    const d = db();
    const a = createEvent(d, actor, input());
    const b = createEvent(d, actor, input({ slug: 'anderes-event' }));
    publishLegalVersion(d, actor, 'terms', a.id, { de: 'A1' });
    publishLegalVersion(d, actor, 'terms', a.id, { de: 'A2', en: 'A2 en' });
    publishLegalVersion(d, actor, 'terms', b.id, { de: 'B1' });
    expect(listLegalVersions(d, 'terms', a.id).map((v) => v.version)).toEqual([2, 1]);
    expect(currentTerms(d, a.id)?.content).toEqual({ de: 'A2', en: 'A2 en' });
    expect(currentTerms(d, b.id)?.version).toBe(1);
  });

  it('Datenschutzerklärung ist global', () => {
    const d = db();
    expect(currentPrivacyNotice(d)).toBeUndefined();
    publishLegalVersion(d, actor, 'privacy', null, { de: 'P1' });
    publishLegalVersion(d, actor, 'privacy', null, { de: 'P2' });
    expect(currentPrivacyNotice(d)?.version).toBe(2);
    expect(() => publishLegalVersion(d, actor, 'privacy', 1, { de: 'x' })).toThrow(ServiceError);
  });

  it('sind für archivierte Events gesperrt', () => {
    const d = db();
    const ev = createEvent(d, actor, input());
    setEventArchived(d, actor, ev.id, true);
    expectServiceError(() => publishLegalVersion(d, actor, 'terms', ev.id, { de: 'x' }), 'ARCHIVED');
  });
});

describe('Veranstalterdaten', () => {
  it('existieren immer genau einmal und protokollieren USt-Wechsel', () => {
    const d = db();
    const initial = getOrganizerSettings(d);
    expect(initial.vatMode).toBe('small_business');
    expect(initial.smallBusinessNote?.de).toContain('Kleinunternehmer');
    const saved = saveOrganizerSettings(d, actor, {
      name: 'Verein',
      address: 'Wien',
      vatId: 'ATU12345678',
      iban: null,
      bic: null,
      contactEmail: null,
      vatMode: 'standard',
      smallBusinessNote: null,
      invoicePaymentTermDays: 30,
    });
    expect(saved.vatMode).toBe('standard');
    expect(getOrganizerSettings(d).invoicePaymentTermDays).toBe(30);
    const entry = d.select().from(auditLog).where(eq(auditLog.action, 'organizer.updated')).get();
    expect(entry?.summary).toContain('small_business → standard');
  });
});
