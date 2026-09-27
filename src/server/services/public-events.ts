/**
 * Öffentliche Sicht auf Events: nur nicht archivierte Events, nur Angaben, die öffentlich sein dürfen
 * (Speaker nur mit bestätigtem Beitrag, Sponsoren nur mit Firmennamen, keine Teilnehmerdaten).
 */
import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import type { PublicPaymentMethod } from '@/lib/validation/public-registration';
import type { Db } from '@/server/db/core';
import { events, legalDocuments, people, sessions, speakers, sponsorPackages, sponsors } from '@/server/db/schema';
import type { Tx } from './audit';
import { getEventStats, registrationState, type EventRow, type RegistrationState } from './events';

export type PublicAvailability = {
  /** open = Anmeldung möglich; unavailable = Event nicht fertig eingerichtet (AGB, Datenschutz oder Zahlungsart fehlt) */
  state: RegistrationState | 'unavailable';
  /** keine freien Plätze (oder Warteliste nicht leer) → neue Anmeldungen kommen auf die Warteliste */
  waitlistOnly: boolean;
  seatsFree: number;
  paymentMethods: PublicPaymentMethod[];
  termsDocumentId: number | null;
  privacyDocumentId: number | null;
  /** was für die öffentliche Anmeldung noch fehlt (für Hinweise im Admin-Bereich) */
  issues: AvailabilityIssue[];
};

export type AvailabilityIssue = 'noTerms' | 'noPrivacy' | 'noPaymentMethod';

type DbLike = Db | Tx;

export function currentPrivacyId(db: DbLike): number | null {
  const row = db
    .select({ id: legalDocuments.id })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.kind, 'privacy'), isNull(legalDocuments.eventId)))
    .orderBy(desc(legalDocuments.version))
    .get();
  return row?.id ?? null;
}

export function availablePaymentMethods(event: EventRow, stripeEnabled: boolean): PublicPaymentMethod[] {
  const methods: PublicPaymentMethod[] = [];
  if (event.allowStripe && stripeEnabled) methods.push('stripe');
  if (event.allowInvoice) methods.push('invoice');
  return methods;
}

export function getAvailability(db: DbLike, event: EventRow, stripeEnabled: boolean, now = new Date()): PublicAvailability {
  const stats = getEventStats(db, event, now);
  const paymentMethods = availablePaymentMethods(event, stripeEnabled);
  const privacyDocumentId = currentPrivacyId(db);
  const needsPayment = event.priceNormalCents > 0 || event.priceMemberCents > 0;
  const issues: AvailabilityIssue[] = [];
  if (!event.termsDocumentId) issues.push('noTerms');
  if (!privacyDocumentId) issues.push('noPrivacy');
  if (needsPayment && paymentMethods.length === 0) issues.push('noPaymentMethod');
  const state = registrationState(event, now);
  return {
    state: state === 'open' && issues.length > 0 ? 'unavailable' : state,
    issues,
    waitlistOnly: stats.seatsFree <= 0 || stats.waitlisted > 0,
    seatsFree: stats.waitlisted > 0 ? 0 : stats.seatsFree,
    paymentMethods,
    termsDocumentId: event.termsDocumentId,
    privacyDocumentId,
  };
}

/** Kommende und laufende Events, nach Beginn sortiert. */
export function listPublicEvents(db: Db, now = new Date()): EventRow[] {
  return db
    .select()
    .from(events)
    .where(and(isNull(events.archivedAt), gte(events.endsAt, now.toISOString())))
    .orderBy(asc(events.startsAt))
    .all();
}

export function getPublicEventBySlug(db: Db, slug: string): EventRow | undefined {
  const event = db.select().from(events).where(eq(events.slug, slug)).get();
  return event && !event.archivedAt ? event : undefined;
}

export type PublicSession = {
  id: number;
  title: EventRow['name'];
  startsAt: string;
  endsAt: string;
  location: string;
  tag: (typeof sessions.$inferSelect)['tag'];
  stream: number;
  speakerName: string | null;
};

export function listPublicSessions(db: Db, eventId: number): PublicSession[] {
  return db
    .select({
      id: sessions.id,
      title: sessions.title,
      startsAt: sessions.startsAt,
      endsAt: sessions.endsAt,
      location: sessions.location,
      tag: sessions.tag,
      stream: sessions.stream,
      proposalStatus: speakers.proposalStatus,
      firstName: people.firstName,
      lastName: people.lastName,
      anonymizedAt: people.anonymizedAt,
    })
    .from(sessions)
    .leftJoin(speakers, eq(speakers.id, sessions.speakerId))
    .leftJoin(people, eq(people.id, speakers.personId))
    .where(eq(sessions.eventId, eventId))
    .orderBy(asc(sessions.startsAt), asc(sessions.stream))
    .all()
    .map(({ proposalStatus, firstName, lastName, anonymizedAt, ...s }) => ({
      ...s,
      speakerName: proposalStatus === 'confirmed' && !anonymizedAt && firstName ? `${firstName} ${lastName}` : null,
    }));
}

export function listPublicSpeakers(db: Db, eventId: number): { name: string; company: string | null }[] {
  return db
    .select({ firstName: people.firstName, lastName: people.lastName, company: people.company })
    .from(speakers)
    .innerJoin(people, eq(people.id, speakers.personId))
    .where(and(eq(speakers.eventId, eventId), eq(speakers.proposalStatus, 'confirmed'), isNull(people.anonymizedAt)))
    .orderBy(asc(people.lastName), asc(people.firstName))
    .all()
    .map((s) => ({ name: `${s.firstName} ${s.lastName}`, company: s.company }));
}

/** Sponsoren gruppiert nach Paket (Reihenfolge der Pakete), ohne Paket am Ende. */
export function listPublicSponsors(db: Db, eventId: number) {
  const rows = db
    .select({ companyName: sponsors.companyName, packageId: sponsorPackages.id, packageName: sponsorPackages.name, sortOrder: sponsorPackages.sortOrder })
    .from(sponsors)
    .leftJoin(sponsorPackages, eq(sponsorPackages.id, sponsors.packageId))
    .where(eq(sponsors.eventId, eventId))
    .all();
  const groups = new Map<number | null, { packageName: EventRow['name'] | null; sortOrder: number; companies: string[] }>();
  for (const r of rows) {
    const g = groups.get(r.packageId) ?? { packageName: r.packageName, sortOrder: r.sortOrder ?? Number.MAX_SAFE_INTEGER, companies: [] };
    g.companies.push(r.companyName);
    groups.set(r.packageId, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ ...g, companies: g.companies.sort((a, b) => a.localeCompare(b, 'de')) }));
}
