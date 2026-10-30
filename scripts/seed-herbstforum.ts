/**
 * Testdaten: füllt das Event „Herbstforum 2026“ (Slug herbstforum-2026) mit 150 fiktiven Anmeldungen, die alle
 * erreichbaren Kombinationen aus Rolle, Anmeldestatus und Zahlungsstatus abdecken (nur für lokale Entwicklung).
 *
 * Aufruf:  npm run seed:herbstforum            (bricht ab, wenn die Testdaten schon vorhanden sind)
 *          npm run seed:herbstforum -- --reset (entfernt vorhandene Testdaten und legt sie neu an)
 *          npm run seed:herbstforum -- --ausgaben (nur die Demo-Ausgaben samt Belegen und Kostengruppen neu anlegen)
 *
 * Alle Zahlungsstatus entstehen über die echten Buchungswege der Services (Kasse, Rechnung, Überweisung,
 * Erstattung, Gutschrift, Storno) – Rechnungen, Zahlungen und Teilnehmerliste sind dadurch konsistent.
 * E-Mails werden keine versendet. Vor jedem Lauf wird die Datenbank nach BACKUP_DIR gesichert.
 * Erkennungsmerkmal der Testpersonen: E-Mail-Adressen auf @herbstforum-seed.example.
 * Dazu Demo-Ausgaben in allen Kostengruppen und Status (Kennzeichen created_by = 'seed-herbstforum').
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, inArray, like } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { loadEnv } from './lib/env';
import { backupDatabase } from '../src/server/db/backup';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';
import * as s from '../src/server/db/schema';
import { viennaDate } from '../src/lib/dates';
import { fakeProvider } from '../src/server/payments/fake';
import type { Refunder } from '../src/server/payments/refunds';
import { fakeRefunder } from '../src/server/payments/refunds';
import type { Actor } from '../src/server/services/audit';
import { beginCheckout, markCheckoutClosed, markCheckoutPaid } from '../src/server/services/checkout';
import { issueRegistrationInvoice, recordBankTransfer, activeInvoiceOf } from '../src/server/services/invoices';
import { markRegistrationPaid } from '../src/server/services/payment-status';
import { getAvailability } from '../src/server/services/public-events';
import { registerPublic } from '../src/server/services/public-registration';
import { cancelRegistration, createManualRefund, executeRefund, recordRefundTransfer } from '../src/server/services/refunds';
import { createRegistrationByAdmin, updateRegistrationByAdmin } from '../src/server/services/registrations';
import { invoiceDir } from '../src/server/invoices/storage';
import { removeReceipt, type ReceiptUpload } from '../src/server/receipts/storage';
import {
  addTemplatesToEvent,
  createEventGroup,
  createExpense,
  listEventGroups,
  listTemplates,
  publishEventGroup,
  setEventGroupActive,
} from '../src/server/services/expenses';
import { createSpeaker } from '../src/server/services/program';

const EVENT_SLUG = 'herbstforum-2026';
const DOMAIN = 'herbstforum-seed.example';
const TOTAL = 150;

loadEnv();
const reset = process.argv.includes('--reset');
const expensesOnly = process.argv.includes('--ausgaben');
const dbPath = databasePathFromEnv();
const db = openDatabase({ path: dbPath, backupDir: backupDirFromEnv() });

const event = db.select().from(s.events).where(eq(s.events.slug, EVENT_SLUG)).get();
if (!event) fail(`Event „${EVENT_SLUG}“ nicht gefunden.`);
const admin = db.select().from(s.authUsers).where(eq(s.authUsers.role, 'admin')).orderBy(s.authUsers.createdAt).get();
const actor: Actor = { userId: admin?.id ?? null };

function fail(message: string): never {
  console.error(`Abbruch: ${message}`);
  db.$client.close();
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Vorhandene Testdaten entfernen (--reset)
// ---------------------------------------------------------------------------

function seedPeopleIds(): number[] {
  return db.select({ id: s.people.id }).from(s.people).where(like(s.people.email, `%@${DOMAIN}`)).all().map((p) => p.id);
}

function removeSeedData(): number {
  const personIds = seedPeopleIds();
  if (personIds.length === 0) return 0;
  const regIds = db.select({ id: s.registrations.id }).from(s.registrations).where(inArray(s.registrations.personId, personIds)).all().map((r) => r.id);
  const removed = { invoices: [] as (typeof s.invoices.$inferSelect)[] };
  db.transaction((tx) => {
    const paymentIds = regIds.length ? tx.select({ id: s.payments.id }).from(s.payments).where(inArray(s.payments.registrationId, regIds)).all().map((p) => p.id) : [];
    const refundIds = paymentIds.length ? tx.select({ id: s.refunds.id }).from(s.refunds).where(inArray(s.refunds.paymentId, paymentIds)).all().map((r) => r.id) : [];
    removed.invoices = regIds.length ? tx.select().from(s.invoices).where(inArray(s.invoices.registrationId, regIds)).all() : [];
    const invoiceIds = removed.invoices.map((i) => i.id);

    const audit = (entity: string, ids: number[]) => {
      if (ids.length) tx.delete(s.auditLog).where(and(eq(s.auditLog.entity, entity), inArray(s.auditLog.entityId, ids.map(String)))).run();
    };
    audit('registration', regIds);
    audit('refund', refundIds);
    audit('invoice', invoiceIds);

    if (invoiceIds.length) tx.delete(s.paymentReminders).where(inArray(s.paymentReminders.invoiceId, invoiceIds)).run();
    if (refundIds.length) tx.delete(s.refunds).where(inArray(s.refunds.id, refundIds)).run();
    if (invoiceIds.length) {
      tx.delete(s.invoices).where(and(inArray(s.invoices.id, invoiceIds), eq(s.invoices.type, 'credit_note'))).run();
      tx.delete(s.invoices).where(inArray(s.invoices.id, invoiceIds)).run();
    }
    if (paymentIds.length) tx.delete(s.payments).where(inArray(s.payments.id, paymentIds)).run();
    if (regIds.length) {
      tx.delete(s.waitlistOffers).where(inArray(s.waitlistOffers.registrationId, regIds)).run();
      tx.delete(s.registrations).where(inArray(s.registrations.id, regIds)).run();
    }
    tx.delete(s.people).where(inArray(s.people.id, personIds)).run();

    // Nummernkreis zurücksetzen, wenn die entfernten Belege das Ende des Kreises waren (sonst bleibt eine Lücke)
    const byYear = new Map<number, number[]>();
    for (const inv of removed.invoices) {
      const [y, n] = inv.number.split('-').map(Number);
      byYear.set(y, [...(byYear.get(y) ?? []), n]);
    }
    for (const [year, numbers] of byYear) {
      const counter = tx.select().from(s.invoiceCounters).where(eq(s.invoiceCounters.year, year)).get();
      if (!counter) continue;
      const remainingMax = Math.max(
        0,
        ...tx.select({ n: s.invoices.number }).from(s.invoices).where(like(s.invoices.number, `${year}-%`)).all().map((r) => Number(r.n.split('-')[1]))
      );
      const tail = new Set(numbers);
      let isTail = true;
      for (let n = remainingMax + 1; n <= counter.lastNumber; n++) if (!tail.has(n)) isTail = false;
      if (isTail) tx.update(s.invoiceCounters).set({ lastNumber: remainingMax }).where(eq(s.invoiceCounters.year, year)).run();
      else console.warn(`Hinweis: Nummernkreis ${year} hat jetzt eine Lücke (danach wurden weitere Belege ausgestellt).`);
    }
  });
  for (const inv of removed.invoices) {
    const file = path.join(invoiceDir(), inv.pdfPath ?? path.posix.join(inv.number.slice(0, 4), `${inv.number}.pdf`));
    fs.rmSync(file, { force: true });
  }
  return personIds.length;
}

// ---------------------------------------------------------------------------
// Fiktive Personen (deterministisch)
// ---------------------------------------------------------------------------

const FIRST = ['Anna', 'Bernhard', 'Carina', 'Daniel', 'Elisabeth', 'Florian', 'Gabriele', 'Harald', 'Ines', 'Johannes', 'Katharina', 'Leopold', 'Magdalena', 'Niklas', 'Olivia', 'Patrick', 'Rosa', 'Sebastian', 'Theresa', 'Valentin', 'Wilma', 'Xaver', 'Yvonne', 'Zoe', 'Matthias', 'Hannah', 'Georg', 'Verena', 'Stefan', 'Lisa', 'Oliver', 'Eva', 'Michael', 'Sarah', 'Andreas', 'Julia', 'Thomas', 'Nina', 'Martin', 'Klara'];
const LAST = ['Aigner', 'Brandstätter', 'Czerny', 'Dorfer', 'Ebner', 'Fink', 'Gruber', 'Haas', 'Illmer', 'Jäger', 'Kofler', 'Lang', 'Maier', 'Nussbaumer', 'Oberhofer', 'Pfeiffer', 'Reiter', 'Schwarz', 'Trummer', 'Unterberger', 'Vogl', 'Weiß', 'Zach', 'Kainz', 'Wimmer', 'Strobl', 'Holzer', 'Riegler', 'Pölzl', 'Lechner', 'Fischer', 'Kern', 'Wolf', 'Hödl', 'Sommer', 'Winter', 'Kraus', 'Brunner', 'Auer', 'Rauch'];
const COMPANIES = ['Steirische Software GmbH', 'Murtal Consulting OG', 'Grazer Stadtwerke Projekt GmbH', 'Alpenblick Events KG', 'Schlossberg Analytics GmbH', 'Kürbis & Partner OG', null, null, null];

function ascii(v: string) {
  return v.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z]/g, '');
}

type Person = { firstName: string; lastName: string; email: string; company: string | null; locale: 'de' | 'en' };

function person(i: number, override?: { firstName?: string; lastName?: string }): Person {
  const firstName = override?.firstName ?? FIRST[(i * 7) % FIRST.length];
  const lastName = override?.lastName ?? LAST[(i * 13 + Math.floor(i / FIRST.length)) % LAST.length];
  return {
    firstName,
    lastName,
    email: `${ascii(firstName)}.${ascii(lastName)}.${String(i + 1).padStart(3, '0')}@${DOMAIN}`,
    company: COMPANIES[i % COMPANIES.length],
    locale: i % 6 === 5 ? 'en' : 'de',
  };
}

// ---------------------------------------------------------------------------
// Fälle: jeder Fall erzeugt über die echten Abläufe genau eine Kombination aus Status und Zahlungsstatus
// ---------------------------------------------------------------------------

type Status = (typeof s.REGISTRATION_STATUSES)[number];
type PayStatus = (typeof s.PAYMENT_STATUSES)[number];
type Ctx = { i: number; p: Person; roles: string[] };
type Case = { key: string; status: Status; pay: PayStatus; path: 'public' | 'admin'; label: string; run: (c: Ctx) => Promise<number> };

const today = () => viennaDate(new Date().toISOString());
const daysAgo = (n: number) => viennaDate(new Date(Date.now() - n * 86_400_000).toISOString());
const failingRefunder: Refunder = async () => ({ id: '', status: 'failed', failureReason: 'Testdaten: Karte abgelaufen (simuliert)' });

const ADDRESS = ['Herrengasse 16\n8010 Graz', 'Annenstraße 3\n8020 Graz', 'Hauptplatz 1\n8700 Leoben', 'Kaiserfeldgasse 9\n8010 Graz'];

let legal: ReturnType<typeof getAvailability>;

/** Öffentliche Anmeldung wie über das Formular; Rollen danach wie im Admin-Dialog. */
function publicRegistration(c: Ctx, memberNumber: string | null = null, expectedPriceCents = event!.priceNormalCents): number {
  const r = registerPublic(
    db,
    event!.id,
    {
      ...c.p,
      memberNumber,
      paymentMethod: expectedPriceCents > 0 ? 'stripe' : null,
      billingCompany: null,
      billingAddress: null,
      photoConsent: c.i % 3 === 0,
      newsletter: c.i % 4 === 0,
      termsDocumentId: legal.termsDocumentId!,
      privacyDocumentId: legal.privacyDocumentId!,
      expectedPriceCents,
    },
    { stripeEnabled: true }
  );
  if (r.status === 'waitlisted') throw new Error('Event ist schon voll bzw. hat eine Warteliste – öffentliche Fälle zuerst anlegen.');
  setRoles(r.registrationId, c);
  return r.registrationId;
}

function setRoles(registrationId: number, c: Ctx) {
  if (c.roles.length === 1 && c.roles[0] === 'attendee') return;
  const reg = db.select().from(s.registrations).where(eq(s.registrations.id, registrationId)).get()!;
  updateRegistrationByAdmin(db, actor, registrationId, {
    ...c.p,
    roles: c.roles,
    ticketType: reg.ticketType,
    priceCents: reg.priceCents,
    billingCompany: reg.billingCompany,
    billingAddress: reg.billingAddress,
  });
}

async function checkout(id: number, c: Ctx): Promise<string> {
  const { ref } = await beginCheckout(db, fakeProvider, id, { locale: c.p.locale });
  return db.select().from(s.payments).where(eq(s.payments.publicRef, ref)).get()!.stripeCheckoutSessionId!;
}

/** Online bezahlt (simulierte Kasse) und Rechnung ausgestellt – wie nach dem Webhook. */
async function paidOnline(c: Ctx): Promise<number> {
  const id = publicRegistration(c);
  const sessionId = await checkout(id, c);
  markCheckoutPaid(db, { sessionId, paymentIntentId: `fake_pi_${sessionId.slice(8, 20)}`, amountCents: null });
  issueRegistrationInvoice(db, actor, id);
  return id;
}

function adminRegistration(c: Ctx, status: 'confirmed' | 'waitlisted', ticket: 'normal' | 'special' | 'member'): number {
  const priceCents = ticket === 'member' ? event!.priceMemberCents : ticket === 'special' ? 2900 : event!.priceNormalCents;
  const invoice = priceCents > 0;
  return createRegistrationByAdmin(db, actor, event!.id, {
    ...c.p,
    roles: c.roles,
    ticketType: ticket,
    priceCents,
    billingCompany: invoice ? (c.p.company ?? `${c.p.firstName} ${c.p.lastName}`) : null,
    billingAddress: invoice ? ADDRESS[c.i % ADDRESS.length] : null,
    status,
    overbook: false,
  });
}

const paidTicket = (c: Ctx) => (c.i % 3 === 2 ? 'special' : 'normal');

function invoiced(c: Ctx, issuedAt?: Date): number {
  const id = adminRegistration(c, 'confirmed', paidTicket(c));
  issueRegistrationInvoice(db, actor, id, issuedAt);
  return id;
}

function paidByTransfer(c: Ctx): number {
  const id = invoiced(c);
  const inv = activeInvoiceOf(db, { registrationId: id })!;
  recordBankTransfer(db, actor, inv.id, { amountCents: inv.grossCents, paidOn: daysAgo(3 + (c.i % 10)) });
  return id;
}

async function executeAll(ids: number[], refunder: Refunder = fakeRefunder) {
  for (const id of ids) await executeRefund(db, actor, id, { refunder });
}

function transferAll(refundIds: number[]) {
  if (refundIds.length) recordRefundTransfer(db, actor, refundIds[0], today());
}

const cancel = (id: number, percent: number | null, reason: string, source: 'admin' | 'attendee' = 'admin') =>
  cancelRegistration(db, actor, id, { reason, percent, source });

const VALID_MEMBERS = db.select().from(s.members).all().filter((m) => !m.validUntil || m.validUntil >= today());
let memberCursor = 0;

const CASES: Case[] = [
  // --- Öffentliche Anmeldungen mit Online-Zahlung (müssen vor Wartelisten-Einträgen kommen) ---
  { key: 'A', status: 'reserved', pay: 'open', path: 'public', label: 'Kasse geöffnet, Zahlung ausstehend', run: async (c) => { const id = publicRegistration(c); await checkout(id, c); return id; } },
  { key: 'R', status: 'cancelled', pay: 'open', path: 'public', label: 'Kassensitzung abgelaufen', run: async (c) => { const id = publicRegistration(c); markCheckoutClosed(db, await checkout(id, c), 'expired'); return id; } },
  { key: 'H', status: 'confirmed', pay: 'paid', path: 'public', label: 'Online bezahlt, Rechnung', run: paidOnline },
  { key: 'K', status: 'confirmed', pay: 'partially_refunded', path: 'public', label: 'Online bezahlt, Kulanz-Teilerstattung', run: async (c) => { const id = await paidOnline(c); await executeAll(createManualRefund(db, actor, id, { amountCents: 1500, reason: 'Kulanz: Parkplatz nicht verfügbar' }).map((r) => r.id)); return id; } },
  { key: 'M', status: 'confirmed', pay: 'refunded', path: 'public', label: 'Online bezahlt, voll erstattet (Freiticket)', run: async (c) => { const id = await paidOnline(c); await executeAll(createManualRefund(db, actor, id, { amountCents: event!.priceNormalCents, reason: 'Nachträglich als Freiticket vereinbart' }).map((r) => r.id)); return id; } },
  { key: 'U', status: 'cancelled', pay: 'paid', path: 'public', label: 'Online bezahlt, storniert ohne Erstattung', run: async (c) => { const id = await paidOnline(c); cancel(id, 0, 'Testdaten: Storno ohne Erstattung'); return id; } },
  { key: 'W', status: 'cancelled', pay: 'paid', path: 'public', label: 'Online bezahlt, selbst storniert, Erstattung wartet auf Freigabe', run: async (c) => { const id = await paidOnline(c); cancel(id, null, 'Testdaten: Terminkollision', 'attendee'); return id; } },
  { key: 'AB', status: 'cancelled', pay: 'paid', path: 'public', label: 'Online bezahlt, storniert, Erstattung fehlgeschlagen', run: async (c) => { const id = await paidOnline(c); await executeAll(cancel(id, 100, 'Testdaten: Krankheit').executeIds, failingRefunder); return id; } },
  { key: 'X', status: 'cancelled', pay: 'partially_refunded', path: 'public', label: 'Online bezahlt, storniert, 50 % erstattet', run: async (c) => { const id = await paidOnline(c); await executeAll(cancel(id, 50, 'Testdaten: Storno 50 %').executeIds); return id; } },
  { key: 'Z', status: 'cancelled', pay: 'refunded', path: 'public', label: 'Online bezahlt, storniert, voll erstattet', run: async (c) => { const id = await paidOnline(c); await executeAll(cancel(id, 100, 'Testdaten: Storno 100 %').executeIds); return id; } },
  { key: 'P', status: 'confirmed', pay: 'not_required', path: 'public', label: 'Mitgliedsticket (kostenlos), öffentlich', run: async (c) => {
      const m = VALID_MEMBERS[memberCursor++ % VALID_MEMBERS.length];
      c.p = { ...c.p, lastName: m.lastName, firstName: m.firstName ?? c.p.firstName, email: c.p.email.replace(/^[^.]+\.[^.]+\./, `${ascii(m.firstName ?? c.p.firstName)}.${ascii(m.lastName)}.`) };
      return publicRegistration(c, m.memberNumber, event!.priceMemberCents);
    } },
  // --- Anmeldungen durch Admins (Rechnung/Überweisung bzw. kostenlos) ---
  { key: 'F', status: 'confirmed', pay: 'open', path: 'admin', label: 'Rechnung überfällig', run: async (c) => invoiced(c, new Date(Date.now() - 25 * 86_400_000)) },
  { key: 'D', status: 'confirmed', pay: 'open', path: 'admin', label: 'Rechnung noch nicht ausgestellt', run: async (c) => adminRegistration(c, 'confirmed', paidTicket(c)) },
  { key: 'E', status: 'confirmed', pay: 'open', path: 'admin', label: 'Rechnung ausgestellt, noch nicht fällig', run: async (c) => invoiced(c) },
  { key: 'G', status: 'confirmed', pay: 'open', path: 'admin', label: 'Rechnung teilweise bezahlt', run: async (c) => { const id = invoiced(c); const inv = activeInvoiceOf(db, { registrationId: id })!; recordBankTransfer(db, actor, inv.id, { amountCents: 1000, paidOn: daysAgo(2) }); return id; } },
  { key: 'I', status: 'confirmed', pay: 'paid', path: 'admin', label: 'Rechnung per Überweisung bezahlt', run: async (c) => paidByTransfer(c) },
  { key: 'J', status: 'confirmed', pay: 'paid', path: 'admin', label: 'Zahlung von Hand verbucht (ohne Rechnung)', run: async (c) => { const id = adminRegistration(c, 'confirmed', paidTicket(c)); markRegistrationPaid(db, actor, id, { paidOn: daysAgo(1), note: 'Testdaten: bar an der Abendkasse' }); return id; } },
  { key: 'L', status: 'confirmed', pay: 'partially_refunded', path: 'admin', label: 'Überwiesen, Kulanz-Teilerstattung rücküberwiesen', run: async (c) => { const id = paidByTransfer(c); transferAll(createManualRefund(db, actor, id, { amountCents: 1000, reason: 'Kulanz: Workshop entfallen' }).map((r) => r.id)); return id; } },
  { key: 'N', status: 'confirmed', pay: 'refunded', path: 'admin', label: 'Überwiesen, voll rücküberwiesen (Freiticket)', run: async (c) => { const id = paidByTransfer(c); const inv = activeInvoiceOf(db, { registrationId: id })!; transferAll(createManualRefund(db, actor, id, { amountCents: inv.grossCents, reason: 'Nachträglich als Freiticket vereinbart' }).map((r) => r.id)); return id; } },
  { key: 'O', status: 'confirmed', pay: 'not_required', path: 'admin', label: 'Mitgliedsticket (kostenlos), durch Admin', run: async (c) => adminRegistration(c, 'confirmed', 'member') },
  { key: 'Q', status: 'cancelled', pay: 'open', path: 'admin', label: 'Rechnung offen, storniert (50 % Gutschrift, Rest offen)', run: async (c) => { const id = invoiced(c); cancel(id, 50, 'Testdaten: Storno mit Stornogebühr'); return id; } },
  { key: 'S', status: 'cancelled', pay: 'not_required', path: 'admin', label: 'Ohne Rechnung storniert', run: async (c) => { const id = adminRegistration(c, 'confirmed', paidTicket(c)); cancel(id, null, 'Testdaten: Doppelanmeldung'); return id; } },
  { key: 'T', status: 'cancelled', pay: 'not_required', path: 'admin', label: 'Mitgliedsticket storniert', run: async (c) => { const id = adminRegistration(c, 'confirmed', 'member'); cancel(id, null, 'Testdaten: Absage'); return id; } },
  { key: 'V', status: 'cancelled', pay: 'paid', path: 'admin', label: 'Überwiesen, storniert ohne Erstattung', run: async (c) => { const id = paidByTransfer(c); cancel(id, 0, 'Testdaten: Storno ohne Erstattung'); return id; } },
  { key: 'Y', status: 'cancelled', pay: 'partially_refunded', path: 'admin', label: 'Überwiesen, storniert, 50 % rücküberwiesen', run: async (c) => { const id = paidByTransfer(c); transferAll(cancel(id, 50, 'Testdaten: Storno 50 %').refundIds); return id; } },
  { key: 'AA', status: 'cancelled', pay: 'refunded', path: 'admin', label: 'Überwiesen, storniert, voll rücküberwiesen', run: async (c) => { const id = paidByTransfer(c); transferAll(cancel(id, 100, 'Testdaten: Storno 100 %').refundIds); return id; } },
  // --- Warteliste zuletzt (danach sind öffentliche Anmeldungen nur noch Wartelisten-Einträge) ---
  { key: 'B', status: 'waitlisted', pay: 'open', path: 'admin', label: 'Warteliste, kostenpflichtig', run: async (c) => adminRegistration(c, 'waitlisted', paidTicket(c)) },
  { key: 'C', status: 'waitlisted', pay: 'not_required', path: 'admin', label: 'Warteliste, Mitgliedsticket', run: async (c) => adminRegistration(c, 'waitlisted', 'member') },
];

/** Die vier Einzelrollen zuerst, damit jeder Fall jede Rolle mindestens einmal hat; danach Kombinationen. */
const ROLE_SETS = [['attendee'], ['speaker'], ['orga'], ['sponsor'], ['attendee', 'speaker'], ['attendee', 'sponsor'], ['speaker', 'orga'], ['attendee', 'speaker', 'orga', 'sponsor']];

// ---------------------------------------------------------------------------
// Ausgaben und Kostengruppen (alle Status, mit/ohne Beleg, mit/ohne Speaker, eventeigene,
// als Vorlage freigegebene und deaktivierte Kostengruppe)
// ---------------------------------------------------------------------------

/** Kennzeichen der Demo-Ausgaben (Spalte created_by), damit --reset bzw. --ausgaben nur diese entfernt. */
const EXPENSE_MARK = 'seed-herbstforum';

const SEED_SPEAKERS = [
  { firstName: 'Helga', lastName: 'Steinbauer', company: 'TU Graz', proposalStatus: 'confirmed' as const, slidesStatus: 'uploaded' as const },
  { firstName: 'Konstantin', lastName: 'Hofer', company: 'Murtal Consulting OG', proposalStatus: 'confirmed' as const, slidesStatus: 'missing' as const },
];
const speakerEmail = (sp: { firstName: string; lastName: string }) => `${ascii(sp.firstName)}.${ascii(sp.lastName)}.speaker@${DOMAIN}`;

function removeSeedExpenses(): number {
  const rows = db
    .select({ id: s.expenses.id, receiptPath: s.expenses.receiptPath })
    .from(s.expenses)
    .where(and(eq(s.expenses.eventId, event!.id), eq(s.expenses.createdBy, EXPENSE_MARK)))
    .all();
  const speakerIds = db
    .select({ id: s.speakers.id })
    .from(s.speakers)
    .innerJoin(s.people, eq(s.people.id, s.speakers.personId))
    .where(and(eq(s.speakers.eventId, event!.id), like(s.people.email, `%@${DOMAIN}`)))
    .all()
    .map((r) => r.id);
  db.transaction((tx) => {
    if (rows.length) {
      tx.delete(s.auditLog).where(and(eq(s.auditLog.entity, 'expense'), inArray(s.auditLog.entityId, rows.map((r) => String(r.id))))).run();
      tx.delete(s.expenses).where(inArray(s.expenses.id, rows.map((r) => r.id))).run();
    }
    if (speakerIds.length) {
      tx.update(s.sessions).set({ speakerId: null }).where(inArray(s.sessions.speakerId, speakerIds)).run();
      tx.update(s.expenses).set({ speakerId: null }).where(inArray(s.expenses.speakerId, speakerIds)).run();
      tx.delete(s.auditLog).where(and(eq(s.auditLog.entity, 'speaker'), inArray(s.auditLog.entityId, speakerIds.map(String)))).run();
      tx.delete(s.speakers).where(inArray(s.speakers.id, speakerIds)).run();
    }
  });
  for (const r of rows) removeReceipt(r.receiptPath);
  return rows.length;
}

/** Einfacher Beleg als PDF (A5). */
function receiptPdf(title: string, lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 40, info: { Title: title, Author: 'Testdaten' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(16).text(title);
    doc.moveDown().fontSize(10);
    for (const l of lines) doc.text(l);
    doc.moveDown().fontSize(8).fillColor('#888888').text('Testdaten – kein echter Beleg');
    doc.end();
  });
}

function ensureGroup(name: string, speakerLink = false): number {
  const found = listEventGroups(db, event!.id).find((g) => g.name.toLowerCase() === name.toLowerCase());
  if (found) {
    if (found.deactivatedAt) setEventGroupActive(db, actor, found.id, true);
    return found.id;
  }
  return createEventGroup(db, actor, event!.id, { name, speakerLink });
}

type DemoExpense = {
  group: string;
  daysAgo: number;
  cents: number;
  status: (typeof s.EXPENSE_STATUSES)[number];
  supplier: string | null;
  description: string;
  speaker?: number;
  receipt?: 'pdf' | 'png';
};

async function seedExpenses() {
  const removed = removeSeedExpenses();
  if (removed) console.log(`${removed} Demo-Ausgaben entfernt.`);

  // Speaker für die Speaker-Kosten (die vorhandenen des Events bleiben unberührt)
  const speakerIds = SEED_SPEAKERS.map((sp) =>
    createSpeaker(db, actor, event!.id, { ...sp, email: speakerEmail(sp), locale: 'de' })
  );

  // Kostengruppen: Standard aus den Vorlagen, dazu eventeigene, freigegebene und deaktivierte
  addTemplatesToEvent(db, actor, event!.id);
  ensureGroup('Technik');
  const foto = ensureGroup('Fotografie');
  const fotoGroup = listEventGroups(db, event!.id).find((g) => g.id === foto)!;
  const fotoTemplateExists = listTemplates(db).some((t) => t.name.toLowerCase() === 'fotografie');
  if (!fotoGroup.templateId && !fotoTemplateExists) publishEventGroup(db, actor, foto);
  const gifts = ensureGroup('Gastgeschenke');

  const S = (n: number) => speakerIds[n];
  const items: DemoExpense[] = [
    // Speaker (mit Speaker-Zuordnung, ein Eintrag ohne)
    { group: 'Speaker', daysAgo: 40, cents: 80000, status: 'paid', supplier: 'Helga Steinbauer', description: 'Honorar Keynote', speaker: S(0), receipt: 'pdf' },
    { group: 'Speaker', daysAgo: 12, cents: 18640, status: 'paid', supplier: 'ÖBB Personenverkehr AG', description: 'Bahnticket Wien–Graz retour', speaker: S(0), receipt: 'png' },
    { group: 'Speaker', daysAgo: -20, cents: 25800, status: 'planned', supplier: 'Hotel Wiesler', description: 'Hotel 2 Nächte', speaker: S(1) },
    { group: 'Speaker', daysAgo: 2, cents: 45000, status: 'new', supplier: 'Konstantin Hofer', description: 'Honorar Workshop', speaker: S(1) },
    { group: 'Speaker', daysAgo: -21, cents: 12000, status: 'planned', supplier: null, description: 'Speaker-Dinner (alle Vortragenden)' },
    // Raum
    { group: 'Raum', daysAgo: 60, cents: 150000, status: 'paid', supplier: 'Messe Congress Graz', description: 'Anzahlung Saalmiete', receipt: 'pdf' },
    { group: 'Raum', daysAgo: -21, cents: 230000, status: 'planned', supplier: 'Messe Congress Graz', description: 'Restzahlung Saalmiete' },
    { group: 'Raum', daysAgo: 5, cents: 9500, status: 'new', supplier: 'Messe Congress Graz', description: 'Garderobe' },
    // Marketing
    { group: 'Marketing', daysAgo: 35, cents: 42990, status: 'paid', supplier: 'Druckerei Moser', description: 'Flyer und Plakate', receipt: 'pdf' },
    { group: 'Marketing', daysAgo: 20, cents: 25000, status: 'paid', supplier: 'LinkedIn Ireland', description: 'Social-Media-Kampagne' },
    { group: 'Marketing', daysAgo: -10, cents: 18000, status: 'planned', supplier: null, description: 'Namensschilder und Lanyards' },
    { group: 'Marketing', daysAgo: 1, cents: 7990, status: 'new', supplier: 'Rollup-Shop', description: 'Roll-up Banner' },
    // Catering
    { group: 'Catering', daysAgo: 15, cents: 120000, status: 'paid', supplier: 'Feinkost Mild', description: 'Anzahlung Catering', receipt: 'pdf' },
    { group: 'Catering', daysAgo: -21, cents: 345000, status: 'planned', supplier: 'Feinkost Mild', description: 'Mittagessen und Kaffeepausen (150 Personen)' },
    { group: 'Catering', daysAgo: 3, cents: 6480, status: 'new', supplier: 'Spar', description: 'Wasser und Snacks Aufbau', receipt: 'png' },
    // Sonstiges
    { group: 'Sonstiges', daysAgo: 25, cents: 4900, status: 'paid', supplier: 'Wiener Städtische', description: 'Veranstaltungsversicherung' },
    { group: 'Sonstiges', daysAgo: -5, cents: 15000, status: 'planned', supplier: null, description: 'Reserve Kleinigkeiten' },
    { group: 'Sonstiges', daysAgo: 0, cents: 2350, status: 'new', supplier: 'Post AG', description: 'Porto Einladungen' },
    // eventeigene Gruppen
    { group: 'Technik', daysAgo: 10, cents: 98000, status: 'paid', supplier: 'AV Rent Steiermark', description: 'Beamer, Mikrofone, Tontechnik', receipt: 'pdf' },
    { group: 'Technik', daysAgo: -21, cents: 35000, status: 'planned', supplier: 'AV Rent Steiermark', description: 'Livestream-Paket' },
    { group: 'Fotografie', daysAgo: -21, cents: 60000, status: 'planned', supplier: 'Studio Lichtblick', description: 'Eventfotografie ganztägig' },
    { group: 'Fotografie', daysAgo: 4, cents: 15000, status: 'new', supplier: 'Studio Lichtblick', description: 'Porträts der Speaker' },
    { group: 'Gastgeschenke', daysAgo: 30, cents: 21000, status: 'paid', supplier: 'Kürbiskernöl Hofladen', description: 'Kernöl-Präsente für Speaker', receipt: 'pdf' },
  ];

  const groups = new Map(listEventGroups(db, event!.id).map((g) => [g.name, g.id]));
  let withReceipt = 0;
  for (const [n, item] of items.entries()) {
    const spentOn = item.daysAgo >= 0 ? daysAgo(item.daysAgo) : viennaDate(new Date(Date.now() - item.daysAgo * 86_400_000).toISOString());
    let receipt: ReceiptUpload | null = null;
    if (item.receipt === 'pdf') {
      const amount = (item.cents / 100).toFixed(2).replace('.', ',');
      const data = await receiptPdf(`Rechnung ${2026}-${String(n + 101).padStart(4, '0')}`, [
        item.supplier ?? '',
        `Datum: ${spentOn}`,
        '',
        item.description,
        `Betrag: € ${amount}`,
        '',
        'An: Herbstforum 2026',
      ]);
      receipt = { fileName: `Rechnung_${ascii(item.supplier ?? 'beleg')}_${spentOn}.pdf`, data };
    } else if (item.receipt === 'png') {
      const data = await QRCode.toBuffer(`Beleg ${item.supplier} ${spentOn} EUR ${(item.cents / 100).toFixed(2)}`, { width: 240 });
      receipt = { fileName: `Kassenbon_${spentOn}.png`, data };
    }
    const id = createExpense(
      db,
      actor,
      event!.id,
      {
        spentOn,
        amountCents: item.cents,
        vatRateBp: null,
        costGroupId: groups.get(item.group)!,
        status: item.status,
        supplier: item.supplier,
        description: item.description,
        speakerId: item.speaker ?? null,
      },
      receipt
    );
    db.update(s.expenses).set({ createdBy: EXPENSE_MARK }).where(eq(s.expenses.id, id)).run();
    if (receipt) withReceipt++;
  }
  // deaktivierte Gruppe: bestehende Ausgabe bleibt, für neue nicht mehr wählbar
  setEventGroupActive(db, actor, gifts, false);

  const totals = db.$client
    .prepare(
      `SELECT g.name AS kostengruppe, x.status, count(*) AS n, sum(x.amount_cents) AS cent
         FROM expenses x JOIN event_cost_groups g ON g.id = x.cost_group_id
        WHERE x.event_id = ? AND x.created_by = ? GROUP BY 1, 2 ORDER BY g.sort_order, 2`
    )
    .all(event!.id, EXPENSE_MARK);
  console.table(totals);
  console.log(`${items.length} Demo-Ausgaben angelegt (${withReceipt} mit Beleg), Kostengruppen „Technik“ (eventeigen), „Fotografie“ (als Vorlage freigegeben) und „Gastgeschenke“ (deaktiviert).`);
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

async function main() {
  if (expensesOnly) {
    const backup = backupDatabase(db.$client, backupDirFromEnv(), 'vor-seed-herbstforum-ausgaben');
    console.log(`Sicherung erstellt: ${backup}`);
    await seedExpenses();
    return;
  }
  const existing = seedPeopleIds().length > 0;
  if (existing && !reset) fail(`Testdaten (@${DOMAIN}) sind schon vorhanden. Neu anlegen mit: npm run seed:herbstforum -- --reset`);
  const backup = backupDatabase(db.$client, backupDirFromEnv(), 'vor-seed-herbstforum');
  console.log(`Sicherung erstellt: ${backup}`);
  if (existing) {
    removeSeedExpenses();
    console.log(`${removeSeedData()} Testpersonen samt Anmeldungen, Zahlungen und Belegen entfernt.`);
  }

  legal = getAvailability(db, event!, true);
  if (!legal.termsDocumentId || !legal.privacyDocumentId) fail('Für das Event fehlen AGB oder Datenschutzerklärung.');
  if (legal.waitlistOnly) fail('Das Event ist voll oder hat schon eine Warteliste – öffentliche Fälle sind dann nicht möglich.');

  // Plan: Anmeldung i → Fall i mod 28, Rollen-Set nach Durchgang; ausgeführt in der Reihenfolge der Fälle
  const plan = Array.from({ length: TOTAL }, (_, i) => ({ i, caseIndex: i % CASES.length, roles: ROLE_SETS[Math.floor(i / CASES.length) % ROLE_SETS.length] }));
  plan.sort((a, b) => a.caseIndex - b.caseIndex || a.i - b.i);

  const results: { key: string; id: number }[] = [];
  for (const step of plan) {
    const c = CASES[step.caseIndex];
    try {
      results.push({ key: c.key, id: await c.run({ i: step.i, p: person(step.i), roles: step.roles }) });
    } catch (error) {
      console.error(`Fehler bei Fall ${c.key} (${c.label}), Anmeldung ${step.i + 1}:`, error);
      throw error;
    }
  }

  await seedExpenses();

  // Kontrolle: erreichter Status je Fall gegen den erwarteten
  const wrong: string[] = [];
  for (const r of results) {
    const reg = db.select().from(s.registrations).where(eq(s.registrations.id, r.id)).get()!;
    const c = CASES.find((x) => x.key === r.key)!;
    if (reg.status !== c.status || reg.paymentStatus !== c.pay) wrong.push(`#${r.id} Fall ${c.key}: ${reg.status}/${reg.paymentStatus} statt ${c.status}/${c.pay}`);
  }

  const summary = db.$client
    .prepare(
      `SELECT r.status, r.payment_status AS pay, r.payment_method AS method, count(*) AS n
         FROM registrations r JOIN people p ON p.id = r.person_id
        WHERE r.event_id = ? AND p.email LIKE ? GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`
    )
    .all(event!.id, `%@${DOMAIN}`);
  console.table(summary);
  const roleMatrix = db.$client
    .prepare(
      `SELECT ro.key AS rolle, count(DISTINCT r.status || '/' || r.payment_status) AS kombinationen, count(*) AS anmeldungen
         FROM registrations r JOIN people p ON p.id = r.person_id
         JOIN registration_roles rr ON rr.registration_id = r.id JOIN roles ro ON ro.id = rr.role_id
        WHERE r.event_id = ? AND p.email LIKE ? GROUP BY 1 ORDER BY 1`
    )
    .all(event!.id, `%@${DOMAIN}`);
  console.table(roleMatrix);
  const docs = db.$client
    .prepare(
      `SELECT i.type, count(*) AS n, sum(i.gross_cents) AS cent FROM invoices i JOIN registrations r ON r.id = i.registration_id
         JOIN people p ON p.id = r.person_id WHERE r.event_id = ? AND p.email LIKE ? GROUP BY 1`
    )
    .all(event!.id, `%@${DOMAIN}`);
  console.table(docs);
  if (wrong.length) {
    console.error(`Abweichungen:\n${wrong.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log(`${results.length} Testanmeldungen im Event „${EVENT_SLUG}“ angelegt, alle mit erwartetem Status.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.close());
