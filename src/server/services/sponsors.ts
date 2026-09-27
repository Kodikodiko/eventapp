/**
 * Sponsorpakete und Sponsoren eines Events.
 * - Pakete lassen sich nur löschen, solange kein Sponsor sie gebucht hat.
 * - Betrag eines Sponsors = Paketpreis − Rabatt (nie negativ).
 * - Ansprechpersonen sind Personen (people) und werden bei jedem Speichern komplett ersetzt.
 * - Sponsoren mit Zahlungen oder Rechnungen können nicht gelöscht werden (Aufbewahrungspflicht).
 */
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { PackageInput, SponsorInput } from '@/lib/validation/sponsors';
import type { Db } from '@/server/db/core';
import { events, invoices, payments, people, sponsorContacts, sponsorPackages, sponsors } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';
import { activeInvoiceNumbersBySponsor } from './invoices';
import { upsertPerson } from './people';

export type PackageRow = typeof sponsorPackages.$inferSelect & { sponsorCount: number };

export type SponsorContactRow = {
  personId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  function: string | null;
  locale: 'de' | 'en';
};

export type SponsorRow = typeof sponsors.$inferSelect & {
  packageName: (typeof sponsorPackages.$inferSelect)['name'] | null;
  packagePriceCents: number;
  amountCents: number;
  contacts: SponsorContactRow[];
  /** Nummer der gültigen (nicht stornierten) Rechnung */
  invoiceNumber: string | null;
};

function loadWritableEvent(tx: Tx | Db, eventId: number) {
  const event = tx.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  return event;
}

// ---------------------------------------------------------------------------
// Pakete
// ---------------------------------------------------------------------------

export function listPackages(db: Db, eventId: number): PackageRow[] {
  const rows = db.select().from(sponsorPackages).where(eq(sponsorPackages.eventId, eventId)).orderBy(asc(sponsorPackages.sortOrder), asc(sponsorPackages.id)).all();
  const counts = new Map(
    db
      .select({ packageId: sponsors.packageId, n: count() })
      .from(sponsors)
      .where(eq(sponsors.eventId, eventId))
      .groupBy(sponsors.packageId)
      .all()
      .map((r) => [r.packageId, r.n])
  );
  return rows.map((p) => ({ ...p, sponsorCount: counts.get(p.id) ?? 0 }));
}

export function createPackage(db: Db, actor: Actor, eventId: number, input: PackageInput): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const [row] = tx.insert(sponsorPackages).values({ ...input, eventId }).returning().all();
    writeAudit(tx, actor, { action: 'sponsor_package.created', entity: 'sponsor_package', entityId: row.id, eventId, summary: `Paket ${input.name.de}` });
    return row.id;
  });
}

export function updatePackage(db: Db, actor: Actor, id: number, input: PackageInput): void {
  db.transaction((tx) => {
    const pkg = tx.select().from(sponsorPackages).where(eq(sponsorPackages.id, id)).get();
    if (!pkg) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, pkg.eventId);
    tx.update(sponsorPackages).set(input).where(eq(sponsorPackages.id, id)).run();
    writeAudit(tx, actor, { action: 'sponsor_package.updated', entity: 'sponsor_package', entityId: id, eventId: pkg.eventId, summary: `Paket ${input.name.de}` });
  });
}

export function deletePackage(db: Db, actor: Actor, id: number): void {
  db.transaction((tx) => {
    const pkg = tx.select().from(sponsorPackages).where(eq(sponsorPackages.id, id)).get();
    if (!pkg) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, pkg.eventId);
    const used = tx.select({ n: count() }).from(sponsors).where(eq(sponsors.packageId, id)).get()?.n ?? 0;
    if (used > 0) throw new ServiceError('CONFLICT', { _form: 'packageInUse' });
    tx.delete(sponsorPackages).where(eq(sponsorPackages.id, id)).run();
    writeAudit(tx, actor, { action: 'sponsor_package.deleted', entity: 'sponsor_package', entityId: id, eventId: pkg.eventId, summary: `Paket ${pkg.name.de}` });
  });
}

// ---------------------------------------------------------------------------
// Sponsoren
// ---------------------------------------------------------------------------

export function listSponsors(db: Db, eventId: number): SponsorRow[] {
  const rows = db
    .select({ s: sponsors, p: sponsorPackages })
    .from(sponsors)
    .leftJoin(sponsorPackages, eq(sponsorPackages.id, sponsors.packageId))
    .where(eq(sponsors.eventId, eventId))
    .all();
  const ids = rows.map((r) => r.s.id);
  const contactRows = ids.length
    ? db
        .select({ c: sponsorContacts, p: people })
        .from(sponsorContacts)
        .innerJoin(people, eq(people.id, sponsorContacts.personId))
        .where(inArray(sponsorContacts.sponsorId, ids))
        .orderBy(asc(sponsorContacts.id))
        .all()
    : [];
  const bySponsor = new Map<number, SponsorContactRow[]>();
  for (const { c, p } of contactRows) {
    bySponsor.set(c.sponsorId, [
      ...(bySponsor.get(c.sponsorId) ?? []),
      { personId: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, function: c.function, locale: p.locale },
    ]);
  }
  const invoiceNumbers = activeInvoiceNumbersBySponsor(db, eventId);
  return rows
    .map(({ s, p }) => {
      const price = p?.priceCents ?? 0;
      return {
        ...s,
        packageName: p?.name ?? null,
        packagePriceCents: price,
        amountCents: Math.max(0, price - s.discountCents),
        contacts: bySponsor.get(s.id) ?? [],
        invoiceNumber: invoiceNumbers.get(s.id) ?? null,
      };
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName, 'de'));
}

function assertPackageOfEvent(tx: Tx, packageId: number | null, eventId: number) {
  if (packageId == null) return;
  const pkg = tx.select().from(sponsorPackages).where(eq(sponsorPackages.id, packageId)).get();
  if (!pkg || pkg.eventId !== eventId) throw new ServiceError('INVALID', { packageId: 'invalid' });
}

function replaceContacts(tx: Tx, sponsorId: number, companyName: string, contacts: SponsorInput['contacts']) {
  tx.delete(sponsorContacts).where(eq(sponsorContacts.sponsorId, sponsorId)).run();
  for (const c of contacts) {
    const personId = upsertPerson(tx, { firstName: c.firstName, lastName: c.lastName, email: c.email, company: companyName, locale: c.locale, phone: c.phone });
    tx.insert(sponsorContacts).values({ sponsorId, personId, function: c.function }).run();
  }
}

function sponsorValues(input: SponsorInput) {
  const { contacts: _contacts, ...values } = input;
  return values;
}

export function createSponsor(db: Db, actor: Actor, eventId: number, input: SponsorInput): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    assertPackageOfEvent(tx, input.packageId, eventId);
    const [row] = tx.insert(sponsors).values({ ...sponsorValues(input), eventId }).returning().all();
    replaceContacts(tx, row.id, input.companyName, input.contacts);
    writeAudit(tx, actor, { action: 'sponsor.created', entity: 'sponsor', entityId: row.id, eventId, summary: `Sponsor ${input.companyName}` });
    return row.id;
  });
}

export function updateSponsor(db: Db, actor: Actor, id: number, input: SponsorInput): void {
  db.transaction((tx) => {
    const current = tx.select().from(sponsors).where(eq(sponsors.id, id)).get();
    if (!current) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, current.eventId);
    assertPackageOfEvent(tx, input.packageId, current.eventId);
    tx.update(sponsors).set(sponsorValues(input)).where(eq(sponsors.id, id)).run();
    replaceContacts(tx, id, input.companyName, input.contacts);
    const summary =
      current.paymentStatus !== input.paymentStatus
        ? `Sponsor ${input.companyName}, Zahlungsstatus ${current.paymentStatus} → ${input.paymentStatus}`
        : `Sponsor ${input.companyName}`;
    writeAudit(tx, actor, { action: 'sponsor.updated', entity: 'sponsor', entityId: id, eventId: current.eventId, summary });
  });
}

export function deleteSponsor(db: Db, actor: Actor, id: number): void {
  db.transaction((tx) => {
    const current = tx.select().from(sponsors).where(eq(sponsors.id, id)).get();
    if (!current) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, current.eventId);
    const hasPayments = (tx.select({ n: count() }).from(payments).where(eq(payments.sponsorId, id)).get()?.n ?? 0) > 0;
    const hasInvoices = (tx.select({ n: count() }).from(invoices).where(eq(invoices.sponsorId, id)).get()?.n ?? 0) > 0;
    if (hasPayments || hasInvoices) throw new ServiceError('CONFLICT', { _form: 'sponsorHasBookings' });
    tx.delete(sponsorContacts).where(eq(sponsorContacts.sponsorId, id)).run();
    tx.delete(sponsors).where(eq(sponsors.id, id)).run();
    writeAudit(tx, actor, { action: 'sponsor.deleted', entity: 'sponsor', entityId: id, eventId: current.eventId, summary: `Sponsor ${current.companyName}` });
  });
}

export type SponsorTotals = { count: number; totalCents: number; paidCents: number; openCents: number };

export function sponsorTotals(rows: SponsorRow[]): SponsorTotals {
  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);
  const paidCents = rows.filter((r) => r.paymentStatus === 'paid').reduce((s, r) => s + r.amountCents, 0);
  return { count: rows.length, totalCents, paidCents, openCents: totalCents - paidCents };
}

/** Für Tests und DSGVO: alle Sponsor-Kontakte einer Person. */
export function sponsorContactsOfPerson(db: Db, personId: number) {
  return db
    .select({ sponsorId: sponsors.id, companyName: sponsors.companyName, eventId: sponsors.eventId, function: sponsorContacts.function })
    .from(sponsorContacts)
    .innerJoin(sponsors, eq(sponsors.id, sponsorContacts.sponsorId))
    .where(and(eq(sponsorContacts.personId, personId)))
    .all();
}
