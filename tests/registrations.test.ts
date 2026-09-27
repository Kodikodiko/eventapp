import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { filterAndSort, filterFromSearchParams, filterToSearchParams, toggleSelection } from '@/lib/registrations-filter';
import type { RegistrationAdminInput } from '@/lib/validation/registrations';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, people, registrations } from '@/server/db/schema';
import { createEvent, getEventStats, setEventArchived } from '@/server/services/events';
import { buildRegistrationsWorkbook } from '@/server/services/export';
import {
  cancelRegistrationByAdmin,
  confirmWaitlistedByAdmin,
  createRegistrationByAdmin,
  listRegistrations,
  updateRegistrationByAdmin,
} from '@/server/services/registrations';

const actor = { userId: 'admin-1' };

function setup(capacity = 2) {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const event = createEvent(db, actor, {
    slug: 'test-event',
    name: { de: 'Test' },
    description: null,
    location: 'Wien',
    startsAt: '2027-05-12T07:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
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
  return { db, event };
}

function person(email: string, overrides: Partial<RegistrationAdminInput> = {}): RegistrationAdminInput {
  return {
    firstName: 'Anna',
    lastName: 'Huber',
    email,
    company: null,
    locale: 'de',
    roles: ['attendee'],
    ticketType: 'normal',
    priceCents: 14900,
    billingCompany: null,
    billingAddress: null,
    ...overrides,
  };
}

function code(fn: () => unknown): { code: string; fields?: Record<string, string> } {
  try {
    fn();
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
  return { code: 'OK' };
}

describe('Anmeldungen durch Admins', () => {
  it('legen Person und Anmeldung mit Rollen an', () => {
    const { db, event } = setup();
    const id = createRegistrationByAdmin(db, actor, event.id, {
      ...person('anna@example.org', { roles: ['attendee', 'speaker'] }),
      status: 'confirmed',
      overbook: false,
    });
    const [row] = listRegistrations(db, event.id);
    expect(row.id).toBe(id);
    expect(row.roles).toEqual(['attendee', 'speaker']);
    expect(row).toMatchObject({ status: 'confirmed', paymentMethod: 'invoice', paymentStatus: 'open', source: 'admin' });
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'registration.created')).all()).toHaveLength(1);
  });

  it('verwenden eine vorhandene Person wieder und verhindern Doppelanmeldungen', () => {
    const { db, event } = setup(5);
    createRegistrationByAdmin(db, actor, event.id, { ...person('anna@example.org'), status: 'confirmed', overbook: false });
    const dup = code(() =>
      createRegistrationByAdmin(db, actor, event.id, { ...person('ANNA@example.org'), status: 'confirmed', overbook: false })
    );
    expect(dup).toEqual({ code: 'CONFLICT', fields: { email: 'alreadyRegistered' } });
    expect(db.select().from(people).all()).toHaveLength(1);
  });

  it('beachten die Kapazität, außer bei bewusster Überbuchung', () => {
    const { db, event } = setup(1);
    createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    const full = code(() => createRegistrationByAdmin(db, actor, event.id, { ...person('b@example.org'), status: 'confirmed', overbook: false }));
    expect(full).toEqual({ code: 'CONFLICT', fields: { status: 'eventFull' } });
    createRegistrationByAdmin(db, actor, event.id, { ...person('c@example.org'), status: 'waitlisted', overbook: false });
    createRegistrationByAdmin(db, actor, event.id, { ...person('d@example.org'), status: 'confirmed', overbook: true });
    expect(getEventStats(db, event)).toMatchObject({ confirmed: 2, waitlisted: 1, seatsFree: 0 });
  });

  it('setzen bei Preis 0 „kostenlos“', () => {
    const { db, event } = setup();
    createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org', { priceCents: 0 }), status: 'confirmed', overbook: false });
    expect(listRegistrations(db, event.id)[0]).toMatchObject({ paymentMethod: 'free', paymentStatus: 'not_required' });
  });

  it('werden bearbeitet; E-Mail darf keiner anderen Person gehören', () => {
    const { db, event } = setup(5);
    const a = createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    createRegistrationByAdmin(db, actor, event.id, { ...person('b@example.org'), status: 'confirmed', overbook: false });
    expect(code(() => updateRegistrationByAdmin(db, actor, a, person('b@example.org')))).toEqual({
      code: 'CONFLICT',
      fields: { email: 'emailInUse' },
    });
    updateRegistrationByAdmin(db, actor, a, person('a.neu@example.org', { lastName: 'Neu', roles: ['orga'], ticketType: 'member', priceCents: 9900 }));
    const row = listRegistrations(db, event.id).find((r) => r.id === a)!;
    expect(row).toMatchObject({ email: 'a.neu@example.org', lastName: 'Neu', roles: ['orga'], ticketType: 'member', priceCents: 9900 });
  });

  it('sperren Preisänderungen nach Zahlung', () => {
    const { db, event } = setup();
    const a = createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    db.update(registrations).set({ paymentStatus: 'paid' }).where(eq(registrations.id, a)).run();
    expect(code(() => updateRegistrationByAdmin(db, actor, a, person('a@example.org', { priceCents: 100 })))).toEqual({
      code: 'CONFLICT',
      fields: { price: 'priceLocked' },
    });
    // Stammdaten bleiben änderbar
    expect(code(() => updateRegistrationByAdmin(db, actor, a, person('a@example.org', { company: 'Firma' })))).toEqual({ code: 'OK' });
  });

  it('werden storniert statt gelöscht und geben den Platz frei', () => {
    const { db, event } = setup(1);
    const a = createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    cancelRegistrationByAdmin(db, actor, a, 'Terminkollision');
    const row = listRegistrations(db, event.id)[0];
    expect(row).toMatchObject({ status: 'cancelled', cancelReason: 'Terminkollision' });
    expect(row.cancelledAt).not.toBeNull();
    expect(getEventStats(db, event).seatsFree).toBe(1);
    expect(code(() => cancelRegistrationByAdmin(db, actor, a, 'nochmal')).code).toBe('CONFLICT');
    // danach ist eine neue Anmeldung derselben Person möglich
    createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
  });

  it('bestätigen Wartelisten-Einträge nur bei freiem Platz oder Überbuchung', () => {
    const { db, event } = setup(1);
    createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    const w = createRegistrationByAdmin(db, actor, event.id, { ...person('w@example.org'), status: 'waitlisted', overbook: false });
    expect(code(() => confirmWaitlistedByAdmin(db, actor, w, false)).fields).toEqual({ status: 'eventFull' });
    confirmWaitlistedByAdmin(db, actor, w, true);
    expect(listRegistrations(db, event.id).find((r) => r.id === w)?.status).toBe('confirmed');
    expect(code(() => confirmWaitlistedByAdmin(db, actor, w, true)).code).toBe('CONFLICT');
  });

  it('sind bei archivierten Events gesperrt', () => {
    const { db, event } = setup();
    const a = createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    setEventArchived(db, actor, event.id, true);
    expect(code(() => cancelRegistrationByAdmin(db, actor, a, 'x')).code).toBe('ARCHIVED');
    expect(code(() => createRegistrationByAdmin(db, actor, event.id, { ...person('b@example.org'), status: 'waitlisted', overbook: false })).code).toBe('ARCHIVED');
  });
});

describe('Filter der Teilnehmerliste', () => {
  const rows = [
    { firstName: 'Anna', lastName: 'Huber', email: 'a@x', company: 'Alpha', status: 'confirmed' as const, roles: ['attendee', 'speaker'], createdAt: '2027-01-02' },
    { firstName: 'Bernd', lastName: 'Adler', email: 'b@x', company: null, status: 'waitlisted' as const, roles: ['attendee'], createdAt: '2027-01-03' },
    { firstName: 'Clara', lastName: 'Özdemir', email: 'c@x', company: 'Beta', status: 'cancelled' as const, roles: ['speaker'], createdAt: '2027-01-01' },
  ];
  const names = (r: typeof rows) => r.map((x) => x.firstName);

  it('verlangt alle gewählten Rollen und einen der gewählten Status', () => {
    expect(names(filterAndSort(rows, { roles: ['attendee', 'speaker'], statuses: [], search: '' }, { key: 'name', direction: 'asc' }))).toEqual(['Anna']);
    expect(names(filterAndSort(rows, { roles: [], statuses: ['confirmed', 'cancelled'], search: '' }, { key: 'name', direction: 'asc' }))).toEqual([
      'Anna',
      'Clara',
    ]);
  });

  it('sucht in Name, E-Mail und Firma', () => {
    expect(names(filterAndSort(rows, { roles: [], statuses: [], search: 'beta' }, { key: 'name', direction: 'asc' }))).toEqual(['Clara']);
  });

  it('sortiert nach Nachname (mit Umlauten) und Anmeldedatum', () => {
    expect(names(filterAndSort(rows, { roles: [], statuses: [], search: '' }, { key: 'name', direction: 'asc' }))).toEqual(['Bernd', 'Anna', 'Clara']);
    expect(names(filterAndSort(rows, { roles: [], statuses: [], search: '' }, { key: 'registered', direction: 'desc' }))).toEqual([
      'Bernd',
      'Anna',
      'Clara',
    ]);
  });

  it('wählt per Badge-Klick einzeln oder mit Strg mehrfach', () => {
    expect(toggleSelection([], 'a', false)).toEqual(['a']);
    expect(toggleSelection(['a'], 'a', false)).toEqual([]);
    expect(toggleSelection(['a'], 'b', false)).toEqual(['b']);
    expect(toggleSelection(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });

  it('übersteht den Weg über die URL', () => {
    const filter = { roles: ['speaker'], statuses: ['confirmed' as const], search: 'Anna' };
    const sort = { key: 'name' as const, direction: 'asc' as const };
    expect(filterFromSearchParams(filterToSearchParams(filter, sort))).toEqual({ filter, sort });
    expect(filterFromSearchParams(new URLSearchParams('statuses=bogus&sort=x:y')).filter.statuses).toEqual([]);
  });
});

describe('Excel-Export', () => {
  it('enthält Kopfzeile und genau die übergebenen Zeilen', async () => {
    const { db, event } = setup(5);
    createRegistrationByAdmin(db, actor, event.id, { ...person('a@example.org'), status: 'confirmed', overbook: false });
    createRegistrationByAdmin(db, actor, event.id, { ...person('b@example.org', { firstName: 'Bernd', priceCents: 0 }), status: 'confirmed', overbook: false });
    const labels = {
      sheet: 'Teilnehmer',
      columns: {
        lastName: 'Nachname', firstName: 'Vorname', email: 'E-Mail', company: 'Firma', roles: 'Rollen', status: 'Status',
        paymentStatus: 'Zahlung', paymentMethod: 'Zahlungsart', ticketType: 'Ticket', price: 'Preis', registered: 'Angemeldet',
      },
      roles: { attendee: 'Teilnehmer:in' },
      statuses: { confirmed: 'Bestätigt' },
      paymentStatuses: { open: 'Offen', not_required: 'Nicht nötig' },
      paymentMethods: { invoice: 'Rechnung', free: 'Kostenlos' },
      ticketTypes: { normal: 'Normal' },
    };
    const buffer = await buildRegistrationsWorkbook(listRegistrations(db, event.id), labels);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Teilnehmer')!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).getCell(1).value).toBe('Nachname');
    const values = [2, 3].map((i) => ws.getRow(i).getCell(2).value);
    expect(values.sort()).toEqual(['Anna', 'Bernd']);
    expect(ws.getRow(2).getCell(5).value).toBe('Teilnehmer:in');
  });
});
