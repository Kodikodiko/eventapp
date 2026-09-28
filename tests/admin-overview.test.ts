import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RegistrationAdminInput } from '@/lib/validation/registrations';
import { openDatabase, type Db } from '@/server/db/core';
import { invoices, registrations } from '@/server/db/schema';
import { defaultNavEventId, getCockpit, navEvents, weeklyBuckets } from '@/server/services/admin-overview';
import { adminSearch } from '@/server/services/admin-search';
import { createEvent, setEventArchived } from '@/server/services/events';
import { issueRegistrationInvoice } from '@/server/services/invoices';
import { saveOrganizerSettings } from '@/server/services/organizer';
import { getRegistrationDetail } from '@/server/services/registration-detail';
import { addRoleToRegistrations, createRegistrationByAdmin, listRegistrations } from '@/server/services/registrations';

const actor = { userId: 'admin-1' };
const NOW = new Date('2027-02-01T10:00:00.000Z');

let dir: string;
let previousDir: string | undefined;
beforeAll(() => {
  previousDir = process.env.INVOICE_DIR;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-overview-'));
  process.env.INVOICE_DIR = dir;
});
afterAll(() => {
  process.env.INVOICE_DIR = previousDir;
  fs.rmSync(dir, { recursive: true, force: true });
});

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const mk = (slug: string, startsAt: string, capacity = 3) =>
    createEvent(db, actor, {
      slug,
      name: { de: `Event ${slug}` },
      description: null,
      location: 'Wien',
      startsAt,
      endsAt: startsAt.replace('T07', 'T16'),
      registrationOpensAt: null,
      registrationClosesAt: null,
      capacity,
      priceNormalCents: 14900,
      priceMemberCents: 9900,
      ticketVatRateBp: 2000,
      allowStripe: true,
      allowInvoice: true,
      refundMode: 'automatic',
      cancellationRules: [],
    });
  saveOrganizerSettings(db, actor, {
    name: 'Verein Beispiel',
    address: 'Hauptplatz 1\n8010 Graz',
    vatId: null,
    iban: 'AT611904300234573201',
    bic: 'BKAUATWW',
    contactEmail: 'office@verein.example',
    vatMode: 'small_business',
    smallBusinessNote: { de: 'Kleinunternehmer.', en: 'Small business.' },
    invoicePaymentTermDays: 14,
  });
  return { db, mk };
}

function person(email: string, o: Partial<RegistrationAdminInput & { status: 'confirmed' | 'waitlisted' }> = {}): RegistrationAdminInput & { status: 'confirmed' | 'waitlisted'; overbook: boolean } {
  return {
    firstName: 'Anna',
    lastName: 'Huber',
    email,
    company: 'Huber Consulting',
    locale: 'de',
    roles: ['attendee'],
    ticketType: 'normal',
    priceCents: 14900,
    billingCompany: null,
    billingAddress: null,
    status: 'confirmed',
    overbook: false,
    ...o,
  };
}

describe('Wochenwerte', () => {
  it('verteilt Anmeldungen auf 8 Wochen, die letzte endet heute', () => {
    const buckets = weeklyBuckets(['2027-02-01T09:00:00.000Z', '2027-01-30T00:00:00.000Z', '2027-01-20T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '2027-03-01T00:00:00.000Z'], NOW);
    expect(buckets).toHaveLength(8);
    expect(buckets.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
  });
});

describe('Navigation', () => {
  it('zählt Teilnehmende ohne Stornos und wählt das nächste Event', () => {
    const { db, mk } = setup();
    const past = mk('vergangen', '2026-05-12T07:00:00.000Z');
    const next = mk('naechstes', '2027-05-12T07:00:00.000Z');
    const archived = mk('alt', '2027-06-12T07:00:00.000Z');
    setEventArchived(db, actor, archived.id, true);
    createRegistrationByAdmin(db, actor, next.id, person('a@example.org'));
    createRegistrationByAdmin(db, actor, next.id, person('b@example.org', { lastName: 'Berger' }));
    const list = navEvents(db, NOW);
    expect(list.map((e) => e.slug)).toEqual(['vergangen', 'naechstes', 'alt']);
    expect(list.find((e) => e.id === next.id)?.counts.attendees).toBe(2);
    expect(list.find((e) => e.id === archived.id)?.archived).toBe(true);
    expect(defaultNavEventId(list, NOW)).toBe(next.id);
    expect(defaultNavEventId(list.filter((e) => e.id === past.id), NOW)).toBe(past.id);
  });
});

describe('Cockpit', () => {
  it('liefert Belegung, offene und überfällige Rechnungen und Aufgaben', () => {
    const { db, mk } = setup();
    const event = mk('cockpit', '2027-05-12T07:00:00.000Z', 2);
    const a = createRegistrationByAdmin(db, actor, event.id, person('a@example.org', { ticketType: 'member', priceCents: 9900 }));
    createRegistrationByAdmin(db, actor, event.id, person('b@example.org'));
    createRegistrationByAdmin(db, actor, event.id, person('c@example.org', { status: 'waitlisted' }));
    const inv = issueRegistrationInvoice(db, actor, a, new Date('2027-01-01T10:00:00.000Z'));

    const c = getCockpit(db, event, NOW);
    expect(c.stats.seatsTaken).toBe(2);
    expect(c.waitlist.count).toBe(1);
    expect(c.invoices).toMatchObject({ openCents: 9900, overdueCents: 9900, openCount: 1, overdueCount: 1 });
    expect(c.tasks).toContainEqual({ kind: 'invoicesOverdue', count: 1, openCents: 9900, reminded: 0 });
    expect(c.mix.memberShare).toBe(50);
    expect(c.weekly.at(-1)?.count).toBeGreaterThanOrEqual(0);
    expect(c.activity.length).toBeGreaterThan(0);

    const row = listRegistrations(db, event.id, NOW).find((r) => r.id === a)!;
    expect(row).toMatchObject({ invoiceNumber: inv.number, invoiceOverdue: true });
    expect(navEvents(db, NOW)[0].counts.overdueInvoices).toBe(1);
  });
});

describe('Detail und Suche', () => {
  it('zeigt Belege und Verlauf einer Anmeldung', () => {
    const { db, mk } = setup();
    const event = mk('detail', '2027-05-12T07:00:00.000Z');
    const a = createRegistrationByAdmin(db, actor, event.id, person('a@example.org'));
    const inv = issueRegistrationInvoice(db, actor, a, NOW);
    const detail = getRegistrationDetail(db, a, NOW)!;
    expect(detail.row.email).toBe('a@example.org');
    expect(detail.invoices.map((i) => i.number)).toEqual([inv.number]);
    expect(detail.history.map((h) => h.entity)).toEqual(expect.arrayContaining(['registration', 'invoice']));
    expect(getRegistrationDetail(db, 9999)).toBeNull();
  });

  it('findet Personen, Belege und Events', () => {
    const { db, mk } = setup();
    const event = mk('pm-summit', '2027-05-12T07:00:00.000Z');
    const a = createRegistrationByAdmin(db, actor, event.id, person('julia@example.org', { firstName: 'Julia', lastName: 'Berger' }));
    const inv = issueRegistrationInvoice(db, actor, a, NOW);
    expect(adminSearch(db, 'j')).toEqual([]);
    expect(adminSearch(db, 'julia berger')[0]).toMatchObject({ kind: 'registration', id: a, eventId: event.id });
    expect(adminSearch(db, 'BERGER').some((h) => h.kind === 'registration')).toBe(true);
    expect(adminSearch(db, inv.number)).toContainEqual(expect.objectContaining({ kind: 'invoice', id: inv.id, eventId: event.id }));
    expect(adminSearch(db, 'summit')).toContainEqual(expect.objectContaining({ kind: 'event', id: event.id }));
    expect(adminSearch(db, '100%_')).toEqual([]);
  });
});

describe('Sammelaktion Rolle', () => {
  it('ergänzt die Rolle nur, wo sie fehlt, und protokolliert', () => {
    const { db, mk } = setup();
    const event = mk('rollen', '2027-05-12T07:00:00.000Z');
    const a = createRegistrationByAdmin(db, actor, event.id, person('a@example.org'));
    const b = createRegistrationByAdmin(db, actor, event.id, person('b@example.org', { roles: ['attendee', 'speaker'] }));
    expect(addRoleToRegistrations(db, actor, [a, b], 'speaker')).toBe(1);
    expect(addRoleToRegistrations(db, actor, [a, b], 'speaker')).toBe(0);
    expect(listRegistrations(db, event.id).find((r) => r.id === a)?.roles).toEqual(['attendee', 'speaker']);
    const other = mk('anderes', '2027-06-12T07:00:00.000Z');
    const c = createRegistrationByAdmin(db, actor, other.id, person('c@example.org'));
    expect(() => addRoleToRegistrations(db, actor, [a, c], 'speaker')).toThrow();
    expect(() => addRoleToRegistrations(db, actor, [a], 'gibtsnicht')).toThrow();
    setEventArchived(db, actor, event.id, true);
    expect(() => addRoleToRegistrations(db, actor, [a], 'sponsor')).toThrow();
    // Rechnungen bleiben unberührt
    expect(db.select().from(invoices).where(eq(invoices.registrationId, a)).all()).toEqual([]);
    expect(db.select().from(registrations).all()).toHaveLength(3);
  });
});
