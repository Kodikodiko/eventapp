/**
 * Kennzahlen für den Admin-Rahmen (Zähler in der Seitenleiste) und das Event-Cockpit.
 * Nur lesend; alle Beträge in Cent.
 */
import { and, count, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { payments, refunds, registrations, waitlistOffers } from '@/server/db/schema';
import { listAuditEntries, type AuditRow } from './audit-log';
import { getEventStats, listEvents, type EventRow, type EventStats } from './events';
import { listInvoices } from './invoices';
import { listSpeakers } from './program';
import { listRefunds, type RefundListRow } from './refunds';
import { listSponsors, sponsorTotals } from './sponsors';

// ---------------------------------------------------------------------------
// Seitenleiste
// ---------------------------------------------------------------------------

export type NavEvent = {
  id: number;
  name: EventRow['name'];
  slug: string;
  startsAt: string;
  location: string | null;
  archived: boolean;
  counts: { attendees: number; overdueInvoices: number; openRefunds: number };
};

/** Alle Events (archivierte zuletzt) mit den Zählern für die Navigation. */
export function navEvents(db: Db, now = new Date()): NavEvent[] {
  const attendeeCounts = new Map(
    db
      .select({ eventId: registrations.eventId, n: count() })
      .from(registrations)
      .where(ne(registrations.status, 'cancelled'))
      .groupBy(registrations.eventId)
      .all()
      .map((r) => [r.eventId, r.n])
  );
  return listEvents(db, { includeArchived: true })
    .sort((a, b) => Number(Boolean(a.archivedAt)) - Number(Boolean(b.archivedAt)) || a.startsAt.localeCompare(b.startsAt))
    .map((e) => {
      const archived = Boolean(e.archivedAt);
      return {
        id: e.id,
        name: e.name,
        slug: e.slug,
        startsAt: e.startsAt,
        location: e.location,
        archived,
        counts: {
          attendees: attendeeCounts.get(e.id) ?? 0,
          overdueInvoices: archived ? 0 : listInvoices(db, e.id, now).filter((i) => i.state === 'overdue').length,
          openRefunds: archived ? 0 : openRefundCount(listRefunds(db, e.id)),
        },
      };
    });
}

function openRefundCount(rows: RefundListRow[]): number {
  return rows.filter((r) => r.status === 'proposed' || r.status === 'failed' || (r.status === 'approved' && r.method === 'bank_transfer')).length;
}

/**
 * Event, das der Admin-Rahmen ohne Event in der URL zeigt: das nächste laufende oder kommende,
 * sonst das zuletzt vergangene nicht archivierte, sonst keines.
 */
export function defaultNavEventId(list: NavEvent[], now = new Date()): number | null {
  const active = list.filter((e) => !e.archived);
  const iso = now.toISOString();
  const upcoming = active.find((e) => e.startsAt >= iso.slice(0, 10)) ?? active.at(-1);
  return upcoming?.id ?? null;
}

// ---------------------------------------------------------------------------
// Cockpit
// ---------------------------------------------------------------------------

export type CockpitTask =
  | { kind: 'refundProposed'; refundId: number; registrationId: number; name: string; amountCents: number; rulePercent: number | null; reason: string }
  | { kind: 'refundFailed'; count: number }
  | { kind: 'refundTransfer'; refundId: number; name: string; amountCents: number; decidedAt: string | null }
  | { kind: 'invoicesOverdue'; count: number; openCents: number; reminded: number }
  | { kind: 'offersOpen'; count: number; nextExpiry: string }
  | { kind: 'reservations'; count: number }
  | { kind: 'speakersWithoutSlides'; count: number };

export type Cockpit = {
  stats: EventStats;
  revenue: { paidCents: number; sponsorPaidCents: number; sponsorOpenCents: number };
  invoices: { openCents: number; overdueCents: number; openCount: number; overdueCount: number };
  waitlist: { count: number; offersOpen: number; nextExpiry: string | null };
  tasks: CockpitTask[];
  /** Anmeldungen je Woche, älteste zuerst; die letzte Woche endet heute */
  weekly: { from: string; count: number }[];
  mix: { active: number; memberShare: number | null; onlineShare: number | null; cancelled: number };
  activity: AuditRow[];
};

const WEEK_MS = 7 * 24 * 60 * 60_000;
export const COCKPIT_WEEKS = 8;

/** Verteilt Zeitpunkte auf `weeks` 7-Tage-Fenster, das letzte endet bei `now`. */
export function weeklyBuckets(timestamps: string[], now: Date, weeks = COCKPIT_WEEKS): { from: string; count: number }[] {
  const end = now.getTime();
  const buckets = Array.from({ length: weeks }, (_, i) => ({ from: new Date(end - (weeks - i) * WEEK_MS).toISOString(), count: 0 }));
  for (const ts of timestamps) {
    const age = end - new Date(ts).getTime();
    if (age < 0 || age >= weeks * WEEK_MS) continue;
    buckets[weeks - 1 - Math.floor(age / WEEK_MS)].count++;
  }
  return buckets;
}

function share(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

export function getCockpit(db: Db, event: EventRow, now = new Date()): Cockpit {
  const stats = getEventStats(db, event, now);
  const nowIso = now.toISOString();

  // Zahlungseingänge der Anmeldungen abzüglich ausgeführter Erstattungen
  const paid =
    db
      .select({ s: sql<number>`coalesce(sum(${payments.amountCents}), 0)` })
      .from(payments)
      .innerJoin(registrations, eq(registrations.id, payments.registrationId))
      .where(and(eq(registrations.eventId, event.id), eq(payments.status, 'succeeded')))
      .get()?.s ?? 0;
  const refunded =
    db
      .select({ s: sql<number>`coalesce(sum(${refunds.amountCents}), 0)` })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .innerJoin(registrations, eq(registrations.id, payments.registrationId))
      .where(and(eq(registrations.eventId, event.id), eq(refunds.status, 'executed')))
      .get()?.s ?? 0;
  const sponsorsTotal = sponsorTotals(listSponsors(db, event.id));

  const invoiceRows = listInvoices(db, event.id, now);
  const openInv = invoiceRows.filter((i) => i.state === 'open' || i.state === 'overdue');
  const overdueInv = openInv.filter((i) => i.state === 'overdue');

  const offers = db
    .select({ expiresAt: waitlistOffers.expiresAt })
    .from(waitlistOffers)
    .innerJoin(registrations, eq(registrations.id, waitlistOffers.registrationId))
    .where(
      and(
        eq(registrations.eventId, event.id),
        eq(registrations.status, 'waitlisted'),
        isNull(waitlistOffers.acceptedAt),
        isNull(waitlistOffers.closedAt),
        gt(waitlistOffers.expiresAt, nowIso)
      )
    )
    .all()
    .map((o) => o.expiresAt)
    .sort();

  const refundRows = listRefunds(db, event.id);
  const tasks: CockpitTask[] = [];
  for (const r of refundRows.filter((r) => r.status === 'proposed')) {
    tasks.push({
      kind: 'refundProposed',
      refundId: r.id,
      registrationId: r.registrationId,
      name: `${r.firstName} ${r.lastName}`.trim(),
      amountCents: r.amountCents,
      rulePercent: r.rulePercent,
      reason: r.reason,
    });
  }
  const failed = refundRows.filter((r) => r.status === 'failed').length;
  if (failed > 0) tasks.push({ kind: 'refundFailed', count: failed });
  if (overdueInv.length > 0) {
    tasks.push({
      kind: 'invoicesOverdue',
      count: overdueInv.length,
      openCents: overdueInv.reduce((s, i) => s + i.openCents, 0),
      reminded: overdueInv.filter((i) => i.reminderLevel > 0).length,
    });
  }
  for (const r of refundRows.filter((r) => r.status === 'approved' && r.method === 'bank_transfer')) {
    tasks.push({ kind: 'refundTransfer', refundId: r.id, name: `${r.firstName} ${r.lastName}`.trim(), amountCents: r.amountCents, decidedAt: r.decidedAt });
  }
  if (offers.length > 0) tasks.push({ kind: 'offersOpen', count: offers.length, nextExpiry: offers[0] });
  if (stats.reserved > 0) {
    const activeReserved = db
      .select({ n: count() })
      .from(registrations)
      .where(and(eq(registrations.eventId, event.id), eq(registrations.status, 'reserved'), gt(registrations.reservedUntil, nowIso)))
      .get()?.n ?? 0;
    if (activeReserved > 0) tasks.push({ kind: 'reservations', count: activeReserved });
  }
  const noSlides = listSpeakers(db, event.id).filter((s) => s.proposalStatus === 'confirmed' && s.slidesStatus === 'missing').length;
  if (noSlides > 0) tasks.push({ kind: 'speakersWithoutSlides', count: noSlides });

  const regRows = db
    .select({
      status: registrations.status,
      createdAt: registrations.createdAt,
      ticketType: registrations.ticketType,
      paymentMethod: registrations.paymentMethod,
      paymentStatus: registrations.paymentStatus,
    })
    .from(registrations)
    .where(eq(registrations.eventId, event.id))
    .all();
  const active = regRows.filter((r) => r.status === 'confirmed' || r.status === 'reserved');
  const paidRows = regRows.filter((r) => ['paid', 'partially_refunded'].includes(r.paymentStatus) && r.status !== 'cancelled');

  return {
    stats,
    revenue: { paidCents: Math.max(0, paid - refunded), sponsorPaidCents: sponsorsTotal.paidCents, sponsorOpenCents: sponsorsTotal.openCents },
    invoices: {
      openCents: openInv.reduce((s, i) => s + i.openCents, 0),
      overdueCents: overdueInv.reduce((s, i) => s + i.openCents, 0),
      openCount: openInv.length,
      overdueCount: overdueInv.length,
    },
    waitlist: { count: stats.waitlisted, offersOpen: offers.length, nextExpiry: offers[0] ?? null },
    tasks,
    weekly: weeklyBuckets(
      regRows.map((r) => r.createdAt),
      now
    ),
    mix: {
      active: active.length,
      memberShare: share(active.filter((r) => r.ticketType === 'member').length, active.length),
      onlineShare: share(paidRows.filter((r) => r.paymentMethod === 'stripe').length, paidRows.length),
      cancelled: stats.cancelled,
    },
    activity: listAuditEntries(db, { q: '', eventId: event.id, entity: '', actor: '', from: '', to: '', page: 1 }).rows.slice(0, 6),
  };
}
