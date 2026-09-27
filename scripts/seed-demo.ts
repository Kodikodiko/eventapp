/**
 * Legt Demodaten in einer LEEREN Datenbank an (nur für lokale Entwicklung).
 * Aufruf: npm run seed:demo   (Datenbank laut DATABASE_PATH, Standard data/eventflow.db)
 * Verweigert, wenn bereits Events vorhanden sind.
 */
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import { loadEnv } from './lib/env';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';
import * as s from '../src/server/db/schema';

loadEnv();
const dbPath = databasePathFromEnv();
const db = openDatabase({ path: dbPath, backupDir: backupDirFromEnv() });

const [{ n: existingEvents }] = db.select({ n: count() }).from(s.events).all();
if (existingEvents > 0) {
  console.error(`Abbruch: ${dbPath} enthält bereits ${existingEvents} Event(s). Demodaten nur in eine leere Datenbank.`);
  process.exit(1);
}

const iso = (d: string) => new Date(d).toISOString();

db.transaction((tx) => {
  // Veranstalter (Kleinunternehmer)
  tx.insert(s.organizerSettings)
    .values({
      id: 1,
      name: 'Demo Veranstaltungsverein',
      address: 'Musterstraße 1\n1010 Wien\nÖsterreich',
      iban: 'AT00 0000 0000 0000 0000',
      bic: 'DEMOATWW',
      contactEmail: 'office@example.org',
      vatMode: 'small_business',
      smallBusinessNote: {
        de: 'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung.',
        en: 'VAT exempt under the small business scheme.',
      },
      invoicePaymentTermDays: 14,
    })
    .run();

  // Datenschutzerklärung (global)
  tx.insert(s.legalDocuments)
    .values({
      kind: 'privacy',
      version: 1,
      validFrom: iso('2026-09-01'),
      content: {
        de: 'Demo-Datenschutzerklärung. Der echte Text folgt vor dem Go-live.',
        en: 'Demo privacy notice. The real text follows before go-live.',
      },
    })
    .run();

  // Events
  const [summit] = tx
    .insert(s.events)
    .values({
      slug: 'pm-summit-2027',
      name: { de: 'PM Summit 2027', en: 'PM Summit 2027' },
      description: {
        de: 'Ein Tag voller Vorträge und Workshops rund um Projektmanagement.',
        en: 'A day full of talks and workshops on project management.',
      },
      location: 'Wien, Konferenzzentrum',
      // 08:00 Wiener Zeit – das Programm beginnt mit Registrierung & Frühstück
      startsAt: iso('2027-05-12T06:00:00Z'),
      endsAt: iso('2027-05-12T16:00:00Z'),
      capacity: 40,
      registrationOpensAt: iso('2026-09-01T00:00:00Z'),
      registrationClosesAt: iso('2027-05-05T22:00:00Z'),
      priceNormalCents: 14900,
      priceMemberCents: 9900,
      refundMode: 'automatic',
    })
    .returning()
    .all();
  const [autumn] = tx
    .insert(s.events)
    .values({
      slug: 'herbstforum-2026',
      name: { de: 'Herbstforum 2026', en: 'Autumn Forum 2026' },
      location: 'Graz',
      startsAt: iso('2026-11-20T08:00:00Z'),
      endsAt: iso('2026-11-20T15:00:00Z'),
      capacity: 5,
      priceNormalCents: 4900,
      priceMemberCents: 0,
      allowStripe: true,
      allowInvoice: false,
      refundMode: 'approval',
    })
    .returning()
    .all();

  for (const ev of [summit, autumn]) {
    const [terms] = tx
      .insert(s.legalDocuments)
      .values({
        kind: 'terms',
        eventId: ev.id,
        version: 1,
        validFrom: iso('2026-09-01'),
        content: {
          de: 'Demo-AGB: Stornierung bis 30 Tage vor Beginn kostenlos, bis 14 Tage 50 %, danach keine Erstattung.',
          en: 'Demo terms: free cancellation up to 30 days before, 50 % up to 14 days, no refund afterwards.',
        },
      })
      .returning()
      .all();
    tx.update(s.events).set({ termsDocumentId: terms.id }).where(eq(s.events.id, ev.id)).run();
    tx.insert(s.cancellationRules)
      .values([
        { eventId: ev.id, daysBeforeEvent: 30, refundPercent: 100 },
        { eventId: ev.id, daysBeforeEvent: 14, refundPercent: 50 },
        { eventId: ev.id, daysBeforeEvent: 0, refundPercent: 0 },
      ])
      .run();
  }

  // Dummy-Mitglieder
  const memberRows = [
    ['M-1001', 'Huber', 'Anna'], ['M-1002', 'Gruber', 'Lukas'], ['M-1003', 'Wagner', 'Sophie'],
    ['M-1004', 'Bauer', 'Felix'], ['M-1005', 'Pichler', 'Laura'], ['M-1006', 'Steiner', 'Jonas'],
    ['M-1007', 'Moser', 'Lena'], ['M-1008', 'Mayer', 'Paul'], ['M-1009', 'Hofer', 'Emma'],
    ['M-1010', 'Leitner', 'David'], ['M-1011', 'Berger', 'Julia', '2026-12-31'], ['M-1012', 'Fuchs', 'Tobias', '2025-12-31'],
  ] as const;
  const insertedMembers = tx
    .insert(s.members)
    .values(memberRows.map(([memberNumber, lastName, firstName, validUntil]) => ({ memberNumber, lastName, firstName, validUntil })))
    .returning()
    .all();
  tx.insert(s.memberImports)
    .values({ fileName: 'demo-mitglieder.csv', rowCount: memberRows.length, addedCount: memberRows.length, updatedCount: 0, removedCount: 0 })
    .run();
  const memberByNumber = new Map(insertedMembers.map((m) => [m.memberNumber, m]));

  const roleRows = tx.select().from(s.roles).all();
  const roleId = (key: string) => roleRows.find((r) => r.key === key)!.id;

  // Personen und Anmeldungen zum Summit
  type Demo = {
    first: string; last: string; company?: string; member?: string;
    status: (typeof s.REGISTRATION_STATUSES)[number];
    pay: (typeof s.PAYMENT_STATUSES)[number];
    method: (typeof s.PAYMENT_METHODS)[number];
    roles?: string[]; locale?: 'de' | 'en';
  };
  const demo: Demo[] = [
    { first: 'Anna', last: 'Huber', member: 'M-1001', status: 'confirmed', pay: 'paid', method: 'stripe' },
    { first: 'Lukas', last: 'Gruber', member: 'M-1002', company: 'Gruber IT GmbH', status: 'confirmed', pay: 'open', method: 'invoice' },
    { first: 'Maria', last: 'Schneider', company: 'Alpen Consulting', status: 'confirmed', pay: 'paid', method: 'invoice' },
    { first: 'John', last: 'Smith', status: 'confirmed', pay: 'paid', method: 'stripe', locale: 'en' },
    { first: 'Sophie', last: 'Wagner', member: 'M-1003', status: 'reserved', pay: 'open', method: 'stripe' },
    { first: 'Thomas', last: 'Eder', status: 'cancelled', pay: 'refunded', method: 'stripe' },
    { first: 'Clara', last: 'Winkler', status: 'waitlisted', pay: 'open', method: 'stripe' },
    { first: 'Felix', last: 'Bauer', member: 'M-1004', status: 'confirmed', pay: 'paid', method: 'stripe', roles: ['attendee', 'speaker'] },
    { first: 'Laura', last: 'Pichler', member: 'M-1005', status: 'confirmed', pay: 'not_required', method: 'free', roles: ['orga'] },
    { first: 'Emily', last: 'Brown', company: 'Example Ltd', status: 'confirmed', pay: 'paid', method: 'stripe', roles: ['attendee', 'sponsor'], locale: 'en' },
  ];

  const peopleByName = new Map<string, number>();
  for (const d of demo) {
    const [person] = tx
      .insert(s.people)
      .values({
        firstName: d.first,
        lastName: d.last,
        email: `${d.first}.${d.last}@example.com`.toLowerCase(),
        company: d.company,
        locale: d.locale ?? 'de',
      })
      .returning()
      .all();
    peopleByName.set(`${d.first} ${d.last}`, person.id);
    const isMember = Boolean(d.member);
    const price = d.method === 'free' ? 0 : isMember ? summit.priceMemberCents : summit.priceNormalCents;
    const [reg] = tx
      .insert(s.registrations)
      .values({
        eventId: summit.id,
        personId: person.id,
        status: d.status,
        paymentStatus: d.pay,
        paymentMethod: d.method,
        ticketType: isMember ? 'member' : 'normal',
        memberId: d.member ? memberByNumber.get(d.member)!.id : null,
        memberNumberEntered: d.member,
        priceCents: price,
        billingCompany: d.method === 'invoice' ? d.company : null,
        billingAddress: d.method === 'invoice' ? 'Beispielgasse 5\n8010 Graz' : null,
        source: 'public',
        reservedUntil: d.status === 'reserved' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
        confirmedAt: d.status === 'confirmed' ? new Date().toISOString() : null,
        cancelledAt: d.status === 'cancelled' ? new Date().toISOString() : null,
        cancelReason: d.status === 'cancelled' ? 'Demo: Terminkollision' : null,
        qrToken: randomUUID(),
      })
      .returning()
      .all();
    tx.insert(s.registrationRoles)
      .values((d.roles ?? ['attendee']).map((key) => ({ registrationId: reg.id, roleId: roleId(key) })))
      .run();
    tx.insert(s.consents)
      .values([
        { personId: person.id, kind: 'terms', eventId: summit.id, source: 'public' },
        { personId: person.id, kind: 'privacy', source: 'public' },
      ])
      .run();
  }

  // Speaker und Programm
  const speakerPeople = [
    { first: 'Evelyn', last: 'Reed', company: 'Reed Advisory' },
    { first: 'Marcus', last: 'Chen', company: 'Chen Labs' },
  ];
  const speakerIds: number[] = [];
  for (const p of speakerPeople) {
    const [person] = tx
      .insert(s.people)
      .values({ firstName: p.first, lastName: p.last, company: p.company, email: `${p.first}.${p.last}@example.com`.toLowerCase(), locale: 'en' })
      .returning()
      .all();
    const [sp] = tx.insert(s.speakers).values({ eventId: summit.id, personId: person.id, proposalStatus: 'confirmed' }).returning().all();
    speakerIds.push(sp.id);
  }
  const felix = tx
    .insert(s.speakers)
    .values({ eventId: summit.id, personId: peopleByName.get('Felix Bauer')!, proposalStatus: 'pending' })
    .returning()
    .all()[0];

  const at = (hhmm: string) => iso(`2027-05-12T${hhmm}:00+02:00`);
  tx.insert(s.sessions)
    .values([
      { eventId: summit.id, title: { de: 'Registrierung & Frühstück', en: 'Registration & breakfast' }, startsAt: at('08:00'), endsAt: at('09:00'), location: 'Foyer', tag: 'general', stream: 1 },
      { eventId: summit.id, title: { de: 'Eröffnungs-Keynote', en: 'Opening keynote' }, startsAt: at('09:00'), endsAt: at('09:45'), location: 'Saal A', tag: 'general', stream: 1, speakerId: speakerIds[0] },
      { eventId: summit.id, title: { de: 'Agile Planung in der Praxis', en: 'Agile planning in practice' }, startsAt: at('10:00'), endsAt: at('10:45'), location: 'Raum 1', tag: 'talk', stream: 1, speakerId: speakerIds[1] },
      { eventId: summit.id, title: { de: 'Risikomanagement kompakt', en: 'Risk management in brief' }, startsAt: at('10:00'), endsAt: at('10:45'), location: 'Raum 2', tag: 'talk', stream: 2, speakerId: felix.id },
      { eventId: summit.id, title: { de: 'Mittagspause', en: 'Lunch break' }, startsAt: at('12:00'), endsAt: at('13:00'), location: 'Foyer', tag: 'break', stream: 1 },
      { eventId: summit.id, title: { de: 'Workshop: Stakeholder-Mapping', en: 'Workshop: stakeholder mapping' }, startsAt: at('13:00'), endsAt: at('14:30'), location: 'Raum 3', tag: 'workshop', stream: 1 },
    ])
    .run();

  // Sponsoring
  const [gold] = tx
    .insert(s.sponsorPackages)
    .values({ eventId: summit.id, name: { de: 'Gold', en: 'Gold' }, benefits: { de: ['Logo auf allen Unterlagen', 'Stand im Foyer', '4 Tickets'], en: ['Logo on all materials', 'Booth in the foyer', '4 tickets'] }, priceCents: 300000, sortOrder: 1 })
    .returning()
    .all();
  tx.insert(s.sponsorPackages)
    .values({ eventId: summit.id, name: { de: 'Silber', en: 'Silver' }, benefits: { de: ['Logo auf der Website', '2 Tickets'], en: ['Logo on the website', '2 tickets'] }, priceCents: 150000, sortOrder: 2 })
    .run();
  const [sponsor] = tx
    .insert(s.sponsors)
    .values({ eventId: summit.id, companyName: 'Example Ltd', packageId: gold.id, billingAddress: '1 Example Street\nLondon', dueOn: '2027-03-31' })
    .returning()
    .all();
  tx.insert(s.sponsorContacts)
    .values({ sponsorId: sponsor.id, personId: peopleByName.get('Emily Brown')!, function: 'Marketing' })
    .run();

  tx.insert(s.auditLog).values({ action: 'seed', entity: 'database', summary: 'Demodaten angelegt' }).run();
});

const counts = Object.fromEntries(
  (['events', 'people', 'members', 'registrations', 'speakers', 'sessions', 'sponsors'] as const).map((t) => [
    t,
    (db.$client.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n,
  ])
);
console.log(`Demodaten angelegt in ${dbPath}:`, counts);
db.$client.close();
