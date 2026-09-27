import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { packageFormSchema, sponsorFormSchema, toPackageInput, toSponsorInput, type PackageInput, type SponsorInput } from '@/lib/validation/sponsors';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, payments, people } from '@/server/db/schema';
import { createEvent, setEventArchived } from '@/server/services/events';
import {
  createPackage,
  createSponsor,
  deletePackage,
  deleteSponsor,
  listPackages,
  listSponsors,
  sponsorContactsOfPerson,
  sponsorTotals,
  updatePackage,
  updateSponsor,
} from '@/server/services/sponsors';

const actor = { userId: 'admin-1' };

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const mk = (slug: string) =>
    createEvent(db, actor, {
      slug,
      name: { de: slug },
      description: null,
      location: '',
      startsAt: '2027-05-12T06:00:00.000Z',
      endsAt: '2027-05-12T16:00:00.000Z',
      registrationOpensAt: null,
      registrationClosesAt: null,
      capacity: 10,
      priceNormalCents: 0,
      priceMemberCents: 0,
      ticketVatRateBp: 2000,
      allowStripe: false,
      allowInvoice: false,
      refundMode: 'automatic',
      cancellationRules: [],
    });
  return { db, event: mk('summit'), other: mk('anderes') };
}

const pkg = (o: Partial<PackageInput> = {}): PackageInput => ({
  name: { de: 'Gold' },
  benefits: { de: ['Logo', 'Stand'] },
  priceCents: 500000,
  vatRateBp: 2000,
  sortOrder: 1,
  ...o,
});

const contact = (email: string) => ({ firstName: 'Max', lastName: 'Muster', email, phone: null, function: 'Marketing', locale: 'de' as const });

const sponsor = (o: Partial<SponsorInput> = {}): SponsorInput => ({
  companyName: 'Acme GmbH',
  packageId: null,
  discountCents: 0,
  dueOn: null,
  paymentStatus: 'open',
  billingAddress: 'Hauptstraße 1, 1010 Wien',
  vatId: null,
  notes: null,
  contacts: [contact('max@acme.example')],
  ...o,
});

function codeOf(fn: () => unknown) {
  try {
    fn();
    return { code: 'OK' };
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
}

describe('Sponsor-Formulare', () => {
  it('Paket: Leistungen zeilenweise, Preis in Cent', () => {
    const v = packageFormSchema.parse({ name: { de: 'Gold', en: '' }, benefits: { de: 'Logo\r\n\n Stand ', en: '' }, price: '5.000', vatRateBp: '2000', sortOrder: '2' });
    expect(toPackageInput(v)).toEqual({ name: { de: 'Gold' }, benefits: { de: ['Logo', 'Stand'] }, priceCents: 500000, vatRateBp: 2000, sortOrder: 2 });
  });

  it('Sponsor: mindestens ein Kontakt, keine doppelten E-Mails', () => {
    const base = { companyName: 'Acme', packageId: '', discount: '0', dueOn: '', paymentStatus: 'open', billingAddress: '', vatId: '', notes: '' };
    const c = { firstName: 'A', lastName: 'B', email: 'a@x.example', phone: '', function: '', locale: 'de' };
    const none = sponsorFormSchema.safeParse({ ...base, contacts: [] });
    expect(none.success).toBe(false);
    expect(none.error?.issues[0].message).toBe('contactRequired');
    const dup = sponsorFormSchema.safeParse({ ...base, contacts: [c, { ...c, email: 'A@X.example' }] });
    expect(dup.error?.issues[0]).toMatchObject({ message: 'duplicateContact', path: ['contacts', 1, 'email'] });
    const bad = sponsorFormSchema.safeParse({ ...base, dueOn: '12.05.2027', contacts: [c] });
    expect(bad.error?.issues[0].message).toBe('date');
    const ok = toSponsorInput(sponsorFormSchema.parse({ ...base, discount: '250', packageId: '3', contacts: [{ ...c, email: ' A@X.example ' }] }));
    expect(ok).toMatchObject({ packageId: 3, discountCents: 25000, dueOn: null, notes: null, contacts: [{ email: 'a@x.example', phone: null, function: null }] });
  });
});

describe('Sponsorpakete', () => {
  it('werden angelegt, bearbeitet und mit Anzahl gelistet', () => {
    const { db, event } = setup();
    const id = createPackage(db, actor, event.id, pkg());
    createPackage(db, actor, event.id, pkg({ name: { de: 'Silber' }, sortOrder: 0 }));
    updatePackage(db, actor, id, pkg({ priceCents: 600000 }));
    createSponsor(db, actor, event.id, sponsor({ packageId: id }));
    const list = listPackages(db, event.id);
    expect(list.map((p) => p.name.de)).toEqual(['Silber', 'Gold']);
    expect(list[1]).toMatchObject({ priceCents: 600000, sponsorCount: 1 });
  });

  it('lassen sich nur ungebucht löschen', () => {
    const { db, event } = setup();
    const id = createPackage(db, actor, event.id, pkg());
    const sid = createSponsor(db, actor, event.id, sponsor({ packageId: id }));
    expect(codeOf(() => deletePackage(db, actor, id))).toEqual({ code: 'CONFLICT', fields: { _form: 'packageInUse' } });
    deleteSponsor(db, actor, sid);
    deletePackage(db, actor, id);
    expect(listPackages(db, event.id)).toHaveLength(0);
  });

  it('sind bei archivierten Events gesperrt', () => {
    const { db, event } = setup();
    setEventArchived(db, actor, event.id, true);
    expect(codeOf(() => createPackage(db, actor, event.id, pkg())).code).toBe('ARCHIVED');
  });
});

describe('Sponsoren', () => {
  it('Betrag = Paketpreis − Rabatt, Summen nach Zahlungsstatus', () => {
    const { db, event } = setup();
    const gold = createPackage(db, actor, event.id, pkg());
    createSponsor(db, actor, event.id, sponsor({ packageId: gold, discountCents: 100000, paymentStatus: 'paid' }));
    createSponsor(db, actor, event.id, sponsor({ companyName: 'Beta AG', packageId: gold, contacts: [contact('b@beta.example')] }));
    createSponsor(db, actor, event.id, sponsor({ companyName: 'Cent KG', packageId: gold, discountCents: 900000, contacts: [contact('c@cent.example')] }));
    const rows = listSponsors(db, event.id);
    expect(rows.map((r) => [r.companyName, r.amountCents])).toEqual([
      ['Acme GmbH', 400000],
      ['Beta AG', 500000],
      ['Cent KG', 0],
    ]);
    expect(sponsorTotals(rows)).toEqual({ count: 3, totalCents: 900000, paidCents: 400000, openCents: 500000 });
  });

  it('Paket muss zum Event gehören', () => {
    const { db, event, other } = setup();
    const foreign = createPackage(db, actor, other.id, pkg());
    expect(codeOf(() => createSponsor(db, actor, event.id, sponsor({ packageId: foreign })))).toEqual({ code: 'INVALID', fields: { packageId: 'invalid' } });
  });

  it('Kontakte sind Personen, werden ersetzt und behalten Firma/Telefon', () => {
    const { db, event } = setup();
    const id = createSponsor(db, actor, event.id, sponsor({ contacts: [{ ...contact('max@acme.example'), phone: '+43 1 234' }] }));
    const person = db.select().from(people).all()[0];
    expect(person).toMatchObject({ company: 'Acme GmbH', phone: '+43 1 234' });
    updateSponsor(db, actor, id, sponsor({ paymentStatus: 'invoiced', contacts: [contact('max@acme.example'), contact('eva@acme.example')] }));
    const row = listSponsors(db, event.id)[0];
    expect(row.contacts.map((c) => c.email)).toEqual(['max@acme.example', 'eva@acme.example']);
    expect(db.select().from(people).all()).toHaveLength(2);
    expect(db.select().from(people).all()[0].phone).toBe('+43 1 234');
    expect(sponsorContactsOfPerson(db, person.id)).toEqual([{ sponsorId: id, companyName: 'Acme GmbH', eventId: event.id, function: 'Marketing' }]);
    const audit = db.select().from(auditLog).all().filter((a) => a.action === 'sponsor.updated');
    expect(audit[0].summary).toBe('Sponsor Acme GmbH, Zahlungsstatus open → invoiced');
    expect(audit[0].summary).not.toContain('@');
  });

  it('mit Zahlungen können nicht gelöscht werden, sonst samt Kontakten', () => {
    const { db, event } = setup();
    const a = createSponsor(db, actor, event.id, sponsor());
    const b = createSponsor(db, actor, event.id, sponsor({ companyName: 'Beta AG', contacts: [contact('b@beta.example')] }));
    db.insert(payments).values({ sponsorId: a, method: 'bank_transfer', amountCents: 100, status: 'succeeded' }).run();
    expect(codeOf(() => deleteSponsor(db, actor, a))).toEqual({ code: 'CONFLICT', fields: { _form: 'sponsorHasBookings' } });
    deleteSponsor(db, actor, b);
    expect(listSponsors(db, event.id).map((s) => s.companyName)).toEqual(['Acme GmbH']);
    expect(db.select().from(people).all()).toHaveLength(2); // Personen bleiben (DSGVO-Löschung separat)
  });
});
