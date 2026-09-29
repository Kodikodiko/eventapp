/**
 * Auto-Seeding für Cloud-/Demo-Umgebungen (wie Firebase App Hosting).
 * Wird nur ausgeführt, wenn AUTO_SEED === 'true' und die events-Tabelle noch leer ist.
 */
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { Db } from './core';
import * as s from './schema';
import { upsertAdmin } from '../auth/admin-users';
import { PRIVACY_NOTICE_DRAFT } from '../services/legal-templates';

const iso = (d: string) => new Date(d).toISOString();

export async function seedIfNeeded(db: Db): Promise<void> {
  if (process.env.AUTO_SEED !== 'true') return;

  const [{ n: existingEvents }] = db.select({ n: count() }).from(s.events).all();
  if (existingEvents > 0) return;

  db.transaction((tx) => {
    // 1. Veranstalter (Kleinunternehmer)
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

    // 2. Datenschutzerklärung (global)
    tx.insert(s.legalDocuments)
      .values({
        kind: 'privacy',
        version: 1,
        validFrom: iso('2026-09-01'),
        content: PRIVACY_NOTICE_DRAFT,
      })
      .run();

    // 3. Events
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

    const at = (hhmm: string) => iso(`2027-05-12T${hhmm}:00+02:00`);
    tx.insert(s.sessions)
      .values([
        { eventId: summit.id, title: { de: 'Registrierung & Frühstück', en: 'Registration & breakfast' }, startsAt: at('08:00'), endsAt: at('09:00'), location: 'Foyer', tag: 'general', stream: 1 },
        { eventId: summit.id, title: { de: 'Eröffnungs-Keynote', en: 'Opening keynote' }, startsAt: at('09:00'), endsAt: at('09:45'), location: 'Saal A', tag: 'general', stream: 1, speakerId: speakerIds[0] },
        { eventId: summit.id, title: { de: 'Agile Planung in der Praxis', en: 'Agile planning in practice' }, startsAt: at('10:00'), endsAt: at('10:45'), location: 'Raum 1', tag: 'talk', stream: 1, speakerId: speakerIds[1] },
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

    tx.insert(s.auditLog).values({ action: 'seed', entity: 'database', summary: 'Auto-Seed: Demodaten angelegt' }).run();
  });

  // Standard-Admin anlegen, falls noch keiner existiert
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.org';
  const adminPassword = process.env.ADMIN_PASSWORD || 'EventFlow2026!';
  try {
    await upsertAdmin(db, {
      email: adminEmail,
      name: 'Administrator',
      password: adminPassword,
    });
    console.log(`[DB] Auto-Seed: Admin ${adminEmail} angelegt.`);
  } catch (err) {
    console.warn('[DB] Auto-Seed Admin-Hinweis:', err);
  }
}
