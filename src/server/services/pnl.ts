/**
 * Erfolgsrechnung je Event (nur lesend, alle Beträge in Cent, brutto).
 *
 * Begriffe:
 * - Ist: tatsächlich geflossenes Geld. Einnahmen = Zahlungseingänge (Tickets, Sponsoren) abzüglich ausgeführter
 *   Erstattungen; Ausgaben = Ausgaben mit Status „bezahlt“.
 * - Offen: Einnahmen = noch nicht bezahlte Tickets aktiver Anmeldungen und offene Sponsorenbeträge, abzüglich
 *   freigegebener, noch nicht ausgeführter Erstattungen; Ausgaben = Status „neu“ und „geplant“.
 * - Prognose = Ist + Offen.
 * - Plan: je Variante (Plan, Minimum, Best Case) erfasste Erwartung; Abweichung = Prognose − Plan.
 * - Vergleich: Ist-Werte von bis zu zwei anderen Events. Sponsoren und Kostengruppen werden über den Namen
 *   zugeordnet; was es nur im Vergleichs-Event gab, wird gesammelt ausgewiesen.
 * - Anmeldungen im Zeitvergleich: Kalenderwochen bzw. Monate werden nach ihrem Abstand zum Event ausgerichtet
 *   (Woche des Events = 0). Das Vergleichs-Event zählt nur bis zum gleichen Abstand in Tagen vor seinem Beginn.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { viennaDate } from '@/lib/dates';
import type { LocalizedText } from '@/lib/localized';
import { sponsorAmountCents } from '@/lib/sponsor-price';
import { nameKey, type ExpenseStatus } from '@/lib/validation/expenses';
import { MAX_COMPARE_EVENTS, PLAN_VARIANT_KEYS, type PlanInput, type PlanPriceKey, type PlanTicketKey, type PlanVariant } from '@/lib/validation/pnl';
import type { Db } from '@/server/db/core';
import {
  discountCodes,
  eventComparisons,
  eventCostGroups,
  eventPlanBudgets,
  eventPlans,
  events,
  expenses,
  payments,
  priceCategories,
  refunds,
  registrations,
  sponsorPackages,
  sponsors,
} from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';
import type { EventRow } from './events';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type Amounts = { actual: number; open: number };
export type TicketKey = PlanTicketKey | 'refunds';
export const TICKET_KEYS: TicketKey[] = ['normal', 'member', 'special', 'free', 'refunds'];

/**
 * Aufschlüsselung einer Ticketzeile nach tatsächlichem Preis: regulär, Early Bird, mit Rabattcode,
 * Sonderpreis-Kategorie oder anderer Betrag – je mit Preis, Anzahl aktiver Anmeldungen, Ist und Offen.
 */
export type TicketVariantKind = 'regular' | 'early_bird' | 'code' | 'category' | 'custom';
export type TicketVariant = Amounts & { kind: TicketVariantKind; name: string | null; priceCents: number; count: number };
export type TicketLine = Amounts & { key: TicketKey; count: number; variants: TicketVariant[] };
export type SponsorStatus = (typeof sponsors.$inferSelect)['paymentStatus'];
export type SponsorLine = Amounts & { id: number; name: string; packageName: LocalizedText | null; status: SponsorStatus };
export type ExpenseItem = { id: number; description: string; supplier: string | null; spentOn: string; status: ExpenseStatus; amountCents: number };
export type GroupLine = Amounts & { id: number; name: string; count: number; items: ExpenseItem[] };

/** Ein Geldfluss für den Verlauf (Tag in Wien, Betrag positiv = Eingang). */
type Movement = { day: string; cents: number };

export type PnlCore = {
  tickets: TicketLine[];
  ticketTotal: Amounts & { count: number };
  /** aktive Anmeldungen mit offener Zahlung */
  openTicketCount: number;
  sponsors: SponsorLine[];
  sponsorTotal: Amounts;
  income: Amounts;
  groups: GroupLine[];
  expenses: Amounts & { count: number };
  result: Amounts;
};

export type PlanValues = PlanInput & { exists: boolean };
export type PlanFigures = {
  tickets: Record<TicketKey, number | null>;
  ticketCounts: Record<PlanTicketKey, number>;
  ticketTotal: number;
  sponsorTotal: number;
  income: number;
  /** Kostengruppen-ID → Budget (fehlt = keine Angabe) */
  groups: Record<number, number>;
  expenses: number;
  result: number;
};
export type PlanView = { values: PlanValues; figures: PlanFigures | null };

export type CompareColumn = {
  eventId: number;
  name: LocalizedText;
  startsAt: string;
  tickets: Record<TicketKey, number>;
  /** Anzahl aktiver Anmeldungen je Tickettyp (zum Übernehmen in den Plan) */
  ticketCounts: Record<TicketKey, number>;
  ticketTotal: number;
  /** Sponsor-ID des aktuellen Events → Ist im Vergleichs-Event */
  sponsors: Record<number, number>;
  otherSponsors: number;
  sponsorTotal: number;
  income: number;
  /** Kostengruppen-ID des aktuellen Events → Ist im Vergleichs-Event */
  groups: Record<number, number>;
  otherGroups: { name: string; cents: number }[];
  expenses: number;
  result: number;
};

export type TimelinePoint = { day: string; cents: number };

export type RegBucket = { start: string; current: number; previous: number | null };
export type RegistrationTrend = {
  total: number;
  compare: { eventId: number; name: LocalizedText; startsAt: string; totalAtSameDistance: number } | null;
  weeks: RegBucket[];
  months: RegBucket[];
};

export type CompareCandidate = { id: number; name: LocalizedText; startsAt: string };

export type Pnl = {
  core: PnlCore;
  plans: Record<PlanVariant, PlanView>;
  compare: CompareColumn[];
  candidates: CompareCandidate[];
  timeline: TimelinePoint[];
  registrations: RegistrationTrend;
  /** Preise des Events als Vorgabe im Plan */
  eventPrices: Record<PlanPriceKey, number>;
};

// ---------------------------------------------------------------------------
// Kalenderhilfen (reine Tage, gerechnet in UTC)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayOfNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** Montag der Kalenderwoche eines Tages. */
export function mondayOf(n: number): number {
  const dow = new Date(n * DAY_MS).getUTCDay();
  return n - ((dow + 6) % 7);
}

/** ISO-Kalenderwoche (1–53) eines Tages. */
export function isoWeek(day: string): number {
  const thursday = mondayOf(dayNumber(day)) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const firstThursday = mondayOf(dayNumber(`${year}-01-04`)) + 3;
  return Math.round((thursday - firstThursday) / 7) + 1;
}

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
const monthStart = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;

// ---------------------------------------------------------------------------
// Ist und Offen eines Events
// ---------------------------------------------------------------------------

const ACTIVE = new Set(['reserved', 'confirmed']);

function computeCore(db: Db, event: EventRow, today: string): { core: PnlCore; movements: Movement[] } {
  const movements: Movement[] = [];
  const dayOf = (iso: string | null | undefined, fallback: string) => (iso ? viennaDate(iso) || fallback : fallback);

  // --- Tickets ---
  const regs = db.select().from(registrations).where(eq(registrations.eventId, event.id)).all();
  const regById = new Map(regs.map((r) => [r.id, r]));
  const regPayments = regs.length
    ? db
        .select()
        .from(payments)
        .where(and(eq(payments.status, 'succeeded'), inArray(payments.registrationId, regs.map((r) => r.id))))
        .all()
    : [];
  const paidByReg = new Map<number, number>();
  for (const p of regPayments) {
    paidByReg.set(p.registrationId!, (paidByReg.get(p.registrationId!) ?? 0) + p.amountCents);
    movements.push({ day: dayOf(p.paidAt ?? p.createdAt, today), cents: p.amountCents });
  }

  const line = (key: TicketKey): TicketLine => ({ key, count: 0, actual: 0, open: 0, variants: [] });
  const tickets = Object.fromEntries(TICKET_KEYS.map((k) => [k, line(k)])) as Record<TicketKey, TicketLine>;
  const categoryNames = new Map(
    db.select({ id: priceCategories.id, name: priceCategories.name }).from(priceCategories).where(eq(priceCategories.eventId, event.id)).all().map((c) => [c.id, c.name])
  );
  const codeNames = new Map(
    db.select({ id: discountCodes.id, code: discountCodes.code }).from(discountCodes).where(eq(discountCodes.eventId, event.id)).all().map((c) => [c.id, c.code])
  );
  const variantsByKey = new Map<string, TicketVariant & { ticket: TicketKey }>();
  let openTicketCount = 0;
  for (const r of regs) {
    const paid = paidByReg.get(r.id) ?? 0;
    const active = ACTIVE.has(r.status);
    const free = paid === 0 && (r.priceCents === 0 || r.paymentStatus === 'not_required');
    const key: TicketKey = free ? 'free' : r.ticketType;
    if (active) tickets[key].count += 1;
    tickets[r.ticketType].actual += paid;
    let open = 0;
    if (active && r.paymentStatus === 'open') {
      open = Math.max(0, r.priceCents - paid);
      tickets[r.ticketType].open += open;
      if (open > 0) openTicketCount += 1;
    }
    if (free || (!active && paid === 0)) continue;
    // Aufschlüsselung nach Preis (nur kostenpflichtige Tickets)
    const kind: TicketVariantKind =
      r.ticketType === 'special'
        ? r.priceCategoryId
          ? 'category'
          : 'custom'
        : r.discountCodeId
          ? 'code'
          : r.priceTier === 'early_bird'
            ? 'early_bird'
            : 'regular';
    const name = kind === 'category' ? (categoryNames.get(r.priceCategoryId!) ?? null) : kind === 'code' ? (codeNames.get(r.discountCodeId!) ?? null) : null;
    const vKey = `${r.ticketType}|${kind}|${name ?? ''}|${r.priceCents}`;
    const v = variantsByKey.get(vKey) ?? { ticket: r.ticketType, kind, name, priceCents: r.priceCents, count: 0, actual: 0, open: 0 };
    if (active) v.count += 1;
    v.actual += paid;
    v.open += open;
    variantsByKey.set(vKey, v);
  }
  const KIND_ORDER: TicketVariantKind[] = ['regular', 'early_bird', 'code', 'category', 'custom'];
  for (const { ticket, ...v } of [...variantsByKey.values()].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (a.name ?? '').localeCompare(b.name ?? '') || b.priceCents - a.priceCents
  )) {
    tickets[ticket].variants.push(v);
  }

  // --- Sponsoren ---
  const sponsorRows = db
    .select({ s: sponsors, p: sponsorPackages })
    .from(sponsors)
    .leftJoin(sponsorPackages, eq(sponsorPackages.id, sponsors.packageId))
    .where(eq(sponsors.eventId, event.id))
    .all();
  const sponsorPayments = sponsorRows.length
    ? db
        .select()
        .from(payments)
        .where(and(eq(payments.status, 'succeeded'), inArray(payments.sponsorId, sponsorRows.map((r) => r.s.id))))
        .all()
    : [];
  const paidBySponsor = new Map<number, number>();
  for (const p of sponsorPayments) {
    paidBySponsor.set(p.sponsorId!, (paidBySponsor.get(p.sponsorId!) ?? 0) + p.amountCents);
    movements.push({ day: dayOf(p.paidAt ?? p.createdAt, today), cents: p.amountCents });
  }

  // --- Erstattungen (zu Ticket- und Sponsorenzahlungen) ---
  const allPayments = [...regPayments, ...sponsorPayments];
  const paymentById = new Map(allPayments.map((p) => [p.id, p]));
  const refundRows = allPayments.length
    ? db
        .select()
        .from(refunds)
        .where(and(inArray(refunds.paymentId, allPayments.map((p) => p.id)), inArray(refunds.status, ['approved', 'executed'])))
        .all()
    : [];
  const refundedBySponsor = new Map<number, number>();
  for (const r of refundRows) {
    const payment = paymentById.get(r.paymentId)!;
    if (payment.sponsorId != null) {
      if (r.status === 'executed') {
        refundedBySponsor.set(payment.sponsorId, (refundedBySponsor.get(payment.sponsorId) ?? 0) + r.amountCents);
        movements.push({ day: dayOf(r.executedAt ?? r.decidedAt, today), cents: -r.amountCents });
      }
      continue;
    }
    if (!regById.has(payment.registrationId!)) continue;
    if (r.status === 'executed') {
      tickets.refunds.count += 1;
      tickets.refunds.actual -= r.amountCents;
      movements.push({ day: dayOf(r.executedAt ?? r.decidedAt, today), cents: -r.amountCents });
    } else {
      tickets.refunds.open -= r.amountCents;
    }
  }

  const sponsorLines: SponsorLine[] = sponsorRows
    .map(({ s, p }) => {
      const amount = sponsorAmountCents(s, p);
      const recorded = (paidBySponsor.get(s.id) ?? 0) - (refundedBySponsor.get(s.id) ?? 0);
      // Zahlungsstatus „bezahlt“ kann am Sponsor auch ohne verbuchten Zahlungseingang gesetzt sein
      const assumed = s.paymentStatus === 'paid' && (paidBySponsor.get(s.id) ?? 0) === 0;
      if (assumed && amount > 0) {
        const due = s.dueOn && s.dueOn <= today ? s.dueOn : dayOf(s.createdAt, today);
        movements.push({ day: due, cents: amount });
      }
      const actual = assumed ? amount : recorded;
      return { id: s.id, name: s.companyName, packageName: p?.name ?? null, status: s.paymentStatus, actual, open: Math.max(0, amount - actual) };
    })
    .sort((a, b) => b.actual + b.open - (a.actual + a.open) || a.name.localeCompare(b.name, 'de'));

  // --- Ausgaben ---
  const groupRows = db
    .select()
    .from(eventCostGroups)
    .where(eq(eventCostGroups.eventId, event.id))
    .orderBy(asc(eventCostGroups.sortOrder), asc(eventCostGroups.id))
    .all();
  const expenseRows = db.select().from(expenses).where(eq(expenses.eventId, event.id)).orderBy(asc(expenses.spentOn), asc(expenses.id)).all();
  const groups: GroupLine[] = groupRows
    .map((g) => {
      const items = expenseRows.filter((e) => e.costGroupId === g.id);
      for (const e of items) if (e.status === 'paid') movements.push({ day: e.spentOn, cents: -e.amountCents });
      return {
        id: g.id,
        name: g.name,
        count: items.length,
        actual: items.filter((e) => e.status === 'paid').reduce((s, e) => s + e.amountCents, 0),
        open: items.filter((e) => e.status !== 'paid').reduce((s, e) => s + e.amountCents, 0),
        items: items.map((e) => ({ id: e.id, description: e.description, supplier: e.supplier, spentOn: e.spentOn, status: e.status, amountCents: e.amountCents })),
        inactive: Boolean(g.deactivatedAt),
      };
    })
    // deaktivierte Kostengruppen ohne Ausgaben nicht zeigen
    .filter((g) => !g.inactive || g.count > 0)
    .map(({ inactive: _inactive, ...g }) => g);

  const sum = (rows: Amounts[]): Amounts => ({ actual: rows.reduce((s, r) => s + r.actual, 0), open: rows.reduce((s, r) => s + r.open, 0) });
  const ticketLines = TICKET_KEYS.map((k) => tickets[k]);
  const ticketTotal = { ...sum(ticketLines), count: ticketLines.filter((l) => l.key !== 'refunds').reduce((s, l) => s + l.count, 0) };
  const sponsorTotal = sum(sponsorLines);
  const income = sum([ticketTotal, sponsorTotal]);
  const expenseTotal = { ...sum(groups), count: expenseRows.length };
  return {
    core: {
      tickets: ticketLines,
      ticketTotal,
      openTicketCount,
      sponsors: sponsorLines,
      sponsorTotal,
      income,
      groups,
      expenses: expenseTotal,
      result: { actual: income.actual - expenseTotal.actual, open: income.open - expenseTotal.open },
    },
    movements,
  };
}

/** Ist-Ergebnis je Kalenderwoche, aufgelaufen; der letzte Punkt ist heute. Höchstens `maxWeeks` Wochen. */
export function resultTimeline(movements: Movement[], today: string, maxWeeks = 26): TimelinePoint[] {
  // vordatierte Buchungen zählen ab heute, damit der Endpunkt immer dem Ist-Ergebnis entspricht
  const past = movements.map((m) => (m.day <= today ? m : { ...m, day: today }));
  if (past.length === 0) return [];
  const todayN = dayNumber(today);
  const first = Math.max(mondayOf(Math.min(...past.map((m) => dayNumber(m.day)))), mondayOf(todayN) - (maxWeeks - 1) * 7);
  const points: TimelinePoint[] = [];
  // Startpunkt: Stand vor der ersten gezeigten Woche
  const before = past.filter((m) => dayNumber(m.day) < first).reduce((s, m) => s + m.cents, 0);
  points.push({ day: dayOfNumber(first), cents: before });
  for (let weekStart = first; weekStart <= todayN; weekStart += 7) {
    const end = Math.min(weekStart + 6, todayN);
    const cents = past.filter((m) => dayNumber(m.day) <= end).reduce((s, m) => s + m.cents, 0);
    points.push({ day: dayOfNumber(end), cents });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Anmeldungen im Zeitvergleich
// ---------------------------------------------------------------------------

function registrationDays(db: Db, eventId: number): string[] {
  return db
    .select({ createdAt: registrations.createdAt, status: registrations.status })
    .from(registrations)
    .where(eq(registrations.eventId, eventId))
    .all()
    .filter((r) => ACTIVE.has(r.status))
    .map((r) => viennaDate(r.createdAt));
}

const MAX_WEEKS = 26;
const MAX_MONTHS = 12;

export function registrationTrend(db: Db, event: EventRow, compareEvent: EventRow | null, today: string): RegistrationTrend {
  const eventDay = viennaDate(event.startsAt);
  const days = registrationDays(db, event.id);
  // Abstand von heute zum Event in Tagen; nach dem Event zählt alles
  const distance = Math.max(0, dayNumber(eventDay) - dayNumber(today));

  const compareDay = compareEvent ? viennaDate(compareEvent.startsAt) : null;
  const compareDays = compareEvent
    ? registrationDays(db, compareEvent.id).filter((d) => dayNumber(compareDay!) - dayNumber(d) >= distance)
    : null;

  function buckets(unit: 'week' | 'month', max: number): RegBucket[] {
    // Montage haben die Tagesnummer 4 (mod 7), weil der 1.1.1970 ein Donnerstag war
    const index = (day: string) => (unit === 'week' ? (mondayOf(dayNumber(day)) - 4) / 7 : monthIndex(day));
    const offsets = (list: string[], anchor: string) => list.map((d) => Math.max(0, index(anchor) - index(d)));
    const current = offsets(days, eventDay);
    const previous = compareDays ? offsets(compareDays, compareDay!) : null;
    const nowOffset = Math.max(0, index(eventDay) - index(today));
    const oldest = Math.min(max - 1 + nowOffset, Math.max(nowOffset, ...current, ...(previous ?? [])));
    const result: RegBucket[] = [];
    for (let k = oldest; k >= nowOffset; k--) {
      const at = index(eventDay) - k;
      result.push({
        start: unit === 'week' ? dayOfNumber(at * 7 + 4) : monthStart(at),
        // Anmeldungen vor dem gezeigten Zeitraum zählen zum ältesten Abschnitt
        current: current.filter((o) => (k === oldest ? o >= k : o === k)).length,
        previous: previous ? previous.filter((o) => (k === oldest ? o >= k : o === k)).length : null,
      });
    }
    return result;
  }

  return {
    total: days.length,
    compare: compareEvent ? { eventId: compareEvent.id, name: compareEvent.name, startsAt: compareEvent.startsAt, totalAtSameDistance: compareDays!.length } : null,
    weeks: buckets('week', MAX_WEEKS),
    months: buckets('month', MAX_MONTHS),
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const emptyPlan = (): PlanValues => ({
  exists: false,
  tickets: { normal: 0, member: 0, special: 0, free: 0 },
  prices: { normal: null, member: null, special: null },
  sponsorIncomeCents: 0,
  budgets: [],
});

export function getPlans(db: Db | Tx, eventId: number): Record<PlanVariant, PlanValues> {
  const result = Object.fromEntries(PLAN_VARIANT_KEYS.map((v) => [v, emptyPlan()])) as Record<PlanVariant, PlanValues>;
  const rows = db.select().from(eventPlans).where(eq(eventPlans.eventId, eventId)).all();
  if (rows.length === 0) return result;
  const budgets = db.select().from(eventPlanBudgets).where(inArray(eventPlanBudgets.planId, rows.map((r) => r.id))).all();
  for (const row of rows) {
    result[row.variant] = {
      exists: true,
      tickets: { normal: row.ticketsNormal, member: row.ticketsMember, special: row.ticketsSpecial, free: row.ticketsFree },
      prices: { normal: row.priceNormalCents, member: row.priceMemberCents, special: row.priceSpecialCents },
      sponsorIncomeCents: row.sponsorIncomeCents,
      budgets: budgets.filter((b) => b.planId === row.id).map((b) => ({ costGroupId: b.costGroupId, amountCents: b.amountCents })),
    };
  }
  return result;
}

export function eventPrices(event: EventRow): Record<PlanPriceKey, number> {
  return { normal: event.priceNormalCents, member: event.priceMemberCents, special: 0 };
}

export function planFigures(event: EventRow, plan: PlanValues): PlanFigures | null {
  if (!plan.exists) return null;
  const defaults = eventPrices(event);
  const amount = (k: PlanPriceKey) => plan.tickets[k] * (plan.prices[k] ?? defaults[k]);
  const tickets: Record<TicketKey, number | null> = { normal: amount('normal'), member: amount('member'), special: amount('special'), free: null, refunds: null };
  const ticketTotal = amount('normal') + amount('member') + amount('special');
  const groups = Object.fromEntries(plan.budgets.map((b) => [b.costGroupId, b.amountCents]));
  const expenseTotal = plan.budgets.reduce((s, b) => s + b.amountCents, 0);
  const income = ticketTotal + plan.sponsorIncomeCents;
  return { tickets, ticketCounts: plan.tickets, ticketTotal, sponsorTotal: plan.sponsorIncomeCents, income, groups, expenses: expenseTotal, result: income - expenseTotal };
}

/** Speichert den Plan einer Variante (legt ihn an oder ersetzt ihn samt Budgets). */
export function savePlan(db: Db, actor: Actor, eventId: number, variant: PlanVariant, input: PlanInput): void {
  db.transaction((tx) => {
    const event = tx.select().from(events).where(eq(events.id, eventId)).get();
    if (!event) throw new ServiceError('NOT_FOUND');
    if (event.archivedAt) throw new ServiceError('ARCHIVED');
    const groupIds = new Set(tx.select({ id: eventCostGroups.id }).from(eventCostGroups).where(eq(eventCostGroups.eventId, eventId)).all().map((g) => g.id));
    for (const b of input.budgets) {
      if (!groupIds.has(b.costGroupId)) throw new ServiceError('INVALID', { [`budgets.${b.costGroupId}`]: 'invalid' });
    }
    const values = {
      ticketsNormal: input.tickets.normal,
      ticketsMember: input.tickets.member,
      ticketsSpecial: input.tickets.special,
      ticketsFree: input.tickets.free,
      priceNormalCents: input.prices.normal,
      priceMemberCents: input.prices.member,
      priceSpecialCents: input.prices.special,
      sponsorIncomeCents: input.sponsorIncomeCents,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.userId,
    };
    const existing = tx.select().from(eventPlans).where(and(eq(eventPlans.eventId, eventId), eq(eventPlans.variant, variant))).get();
    let planId: number;
    if (existing) {
      tx.update(eventPlans).set(values).where(eq(eventPlans.id, existing.id)).run();
      tx.delete(eventPlanBudgets).where(eq(eventPlanBudgets.planId, existing.id)).run();
      planId = existing.id;
    } else {
      planId = tx.insert(eventPlans).values({ ...values, eventId, variant }).returning({ id: eventPlans.id }).get().id;
    }
    if (input.budgets.length) tx.insert(eventPlanBudgets).values(input.budgets.map((b) => ({ planId, ...b }))).run();
    writeAudit(tx, actor, {
      action: existing ? 'event_plan.updated' : 'event_plan.created',
      entity: 'event_plan',
      entityId: planId,
      eventId,
      summary: `Erfolgsrechnung: Plan „${variant}“ gespeichert`,
    });
  });
}

// ---------------------------------------------------------------------------
// Vergleichs-Events
// ---------------------------------------------------------------------------

export function getComparisonIds(db: Db | Tx, eventId: number): number[] {
  return db
    .select({ id: eventComparisons.compareEventId })
    .from(eventComparisons)
    .where(eq(eventComparisons.eventId, eventId))
    .orderBy(asc(eventComparisons.position))
    .all()
    .map((r) => r.id);
}

/** Legt fest, mit welchen Events verglichen wird (höchstens zwei, Reihenfolge wie übergeben). */
export function setComparisons(db: Db, actor: Actor, eventId: number, compareIds: number[]): void {
  db.transaction((tx) => {
    const ids = [...new Set(compareIds)];
    if (ids.length > MAX_COMPARE_EVENTS || ids.includes(eventId)) throw new ServiceError('INVALID', { _form: 'invalid' });
    const known = new Set(tx.select({ id: events.id }).from(events).all().map((e) => e.id));
    if (!known.has(eventId)) throw new ServiceError('NOT_FOUND');
    if (ids.some((id) => !known.has(id))) throw new ServiceError('INVALID', { _form: 'invalid' });
    tx.delete(eventComparisons).where(eq(eventComparisons.eventId, eventId)).run();
    if (ids.length) tx.insert(eventComparisons).values(ids.map((compareEventId, i) => ({ eventId, compareEventId, position: i + 1 }))).run();
    writeAudit(tx, actor, {
      action: 'event_comparison.updated',
      entity: 'event',
      entityId: eventId,
      eventId,
      summary: `Erfolgsrechnung: Vergleich mit ${ids.length ? `Event ${ids.join(', ')}` : 'keinem Event'}`,
    });
  });
}

function compareColumn(db: Db, current: PnlCore, other: EventRow, today: string): CompareColumn {
  const { core } = computeCore(db, other, today);
  const tickets = Object.fromEntries(core.tickets.map((t) => [t.key, t.actual])) as Record<TicketKey, number>;

  // Zuordnung über den Namen; bei gleichem Namen bekommt jede Zeile höchstens einen Partner
  function match<T extends { id: number; name: string }>(mine: T[], theirs: { name: string; actual: number }[]) {
    const pool = theirs.map((t) => ({ ...t, used: false }));
    const matched: Record<number, number> = {};
    for (const row of mine) {
      const partner = pool.find((t) => !t.used && nameKey(t.name) === nameKey(row.name));
      if (partner) {
        partner.used = true;
        matched[row.id] = partner.actual;
      }
    }
    return { matched, rest: pool.filter((t) => !t.used) };
  }
  const sponsorMatch = match(current.sponsors, core.sponsors);
  const groupMatch = match(current.groups, core.groups);
  return {
    eventId: other.id,
    name: other.name,
    startsAt: other.startsAt,
    tickets,
    ticketCounts: Object.fromEntries(core.tickets.map((t) => [t.key, t.count])) as Record<TicketKey, number>,
    ticketTotal: core.ticketTotal.actual,
    sponsors: sponsorMatch.matched,
    otherSponsors: sponsorMatch.rest.reduce((s, r) => s + r.actual, 0),
    sponsorTotal: core.sponsorTotal.actual,
    income: core.income.actual,
    groups: groupMatch.matched,
    otherGroups: groupMatch.rest.filter((r) => r.actual !== 0).map((r) => ({ name: r.name, cents: r.actual })),
    expenses: core.expenses.actual,
    result: core.result.actual,
  };
}

// ---------------------------------------------------------------------------
// Gesamtsicht
// ---------------------------------------------------------------------------

export function getPnl(db: Db, event: EventRow, now = new Date()): Pnl {
  const today = viennaDate(now.toISOString());
  const { core, movements } = computeCore(db, event, today);
  const plans = getPlans(db, event.id);
  const allEvents = db.select().from(events).all();
  const compareEvents = getComparisonIds(db, event.id)
    .map((id) => allEvents.find((e) => e.id === id))
    .filter((e): e is EventRow => Boolean(e));
  return {
    core,
    plans: Object.fromEntries(PLAN_VARIANT_KEYS.map((v) => [v, { values: plans[v], figures: planFigures(event, plans[v]) }])) as Record<PlanVariant, PlanView>,
    compare: compareEvents.map((e) => compareColumn(db, core, e, today)),
    candidates: allEvents
      .filter((e) => e.id !== event.id)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map((e) => ({ id: e.id, name: e.name, startsAt: e.startsAt })),
    timeline: resultTimeline(movements, today),
    registrations: registrationTrend(db, event, compareEvents[0] ?? null, today),
    eventPrices: eventPrices(event),
  };
}
