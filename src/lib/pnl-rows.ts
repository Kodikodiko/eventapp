/**
 * Zeilen der Erfolgsrechnung als flache Liste – gemeinsame Grundlage für die Tabelle und den Excel-Export.
 * Reine Aufbereitung: gerechnet wird in src/server/services/pnl.ts.
 */
import type { LocalizedText } from '@/lib/localized';
import type { ExpenseStatus } from '@/lib/validation/expenses';
import type { PlanVariant } from '@/lib/validation/pnl';
import type { Pnl, SponsorStatus, TicketKey, TicketVariant } from '@/server/services/pnl';

export type PnlRowKind = 'section' | 'heading' | 'line' | 'item' | 'subtotal' | 'total' | 'result';
export type PnlLabel =
  | { key: 'income' | 'expenses' | 'tickets' | 'sponsors' | 'sumTickets' | 'sumSponsors' | 'sumIncome' | 'sumExpenses' | 'result' | 'otherSponsors' }
  | { ticket: TicketKey }
  | { variant: Pick<TicketVariant, 'kind' | 'name' | 'priceCents'> }
  | { text: string };

export type PnlRow = {
  /** eindeutig; dient auch als Sprungziel (#…) */
  id: string;
  kind: PnlRowKind;
  /** bestimmt, ob eine positive Abweichung gut (Einnahmen, Ergebnis) oder schlecht (Ausgaben) ist */
  side: 'income' | 'expense' | 'result';
  label: PnlLabel;
  sub?: LocalizedText | string | null;
  badge?: { sponsor: SponsorStatus } | { expense: ExpenseStatus } | { compareOnly: true };
  count?: number | null;
  actual?: number | null;
  open?: number | null;
  /** undefined = Zelle leer, null = keine Angabe („–“) */
  plan?: number | null;
  /** Abweichung Prognose − Plan; undefined = Zelle leer */
  deviation?: number;
  /** je Vergleichs-Event: Ist; null = keine Angabe */
  compare?: (number | null)[];
  /** Kostengruppe, die sich aufklappen lässt */
  groupId?: number;
  /** Einzelposten einer Kostengruppe */
  parentGroupId?: number;
  date?: string;
};

export const forecastOf = (row: Pick<PnlRow, 'actual' | 'open'>) => (row.actual ?? 0) + (row.open ?? 0);

export function buildPnlRows(pnl: Pnl, variant: PlanVariant): PnlRow[] {
  const { core, compare } = pnl;
  const plan = pnl.plans[variant].figures;
  const rows: PnlRow[] = [];
  const dev = (forecast: number, planned: number | null | undefined) => (plan ? forecast - (planned ?? 0) : undefined);

  rows.push({ id: 'income', kind: 'section', side: 'income', label: { key: 'income' } });
  rows.push({ id: 'tickets', kind: 'heading', side: 'income', label: { key: 'tickets' } });
  core.tickets.forEach((t, index) => {
    const isFree = t.key === 'free';
    const forecast = t.actual + t.open;
    // Aufschlüsseln nach Preis, sobald es mehr als den regulären Preis gibt (negative ID: keine Kostengruppe)
    const breakdown = t.variants.length > 1 || (t.variants.length === 1 && t.variants[0].kind !== 'regular');
    const groupId = breakdown ? -(index + 1) : undefined;
    rows.push({
      id: `ticket-${t.key}`,
      kind: 'line',
      side: 'income',
      label: { ticket: t.key },
      count: t.count,
      actual: isFree ? null : t.actual,
      open: isFree ? null : t.open,
      plan: plan ? plan.tickets[t.key] : null,
      deviation: isFree ? undefined : dev(forecast, plan?.tickets[t.key]),
      compare: compare.map((c) => (isFree ? null : c.tickets[t.key])),
      groupId,
    });
    if (groupId === undefined) return;
    t.variants.forEach((v, i) => {
      rows.push({
        id: `ticket-${t.key}-${i}`,
        kind: 'item',
        side: 'income',
        label: { variant: { kind: v.kind, name: v.name, priceCents: v.priceCents } },
        count: v.count,
        actual: v.actual,
        open: v.open,
        parentGroupId: groupId,
      });
    });
  });
  rows.push({
    id: 'sum-tickets',
    kind: 'subtotal',
    side: 'income',
    label: { key: 'sumTickets' },
    count: core.ticketTotal.count,
    actual: core.ticketTotal.actual,
    open: core.ticketTotal.open,
    plan: plan ? plan.ticketTotal : null,
    deviation: dev(core.ticketTotal.actual + core.ticketTotal.open, plan?.ticketTotal),
    compare: compare.map((c) => c.ticketTotal),
  });

  rows.push({ id: 'sponsors', kind: 'heading', side: 'income', label: { key: 'sponsors' } });
  for (const s of core.sponsors) {
    rows.push({
      id: `sponsor-${s.id}`,
      kind: 'line',
      side: 'income',
      label: { text: s.name },
      sub: s.packageName,
      badge: { sponsor: s.status },
      actual: s.actual,
      open: s.open,
      compare: compare.map((c) => c.sponsors[s.id] ?? null),
    });
  }
  if (compare.some((c) => c.otherSponsors !== 0)) {
    rows.push({
      id: 'sponsor-others',
      kind: 'line',
      side: 'income',
      label: { key: 'otherSponsors' },
      badge: { compareOnly: true },
      actual: null,
      open: null,
      compare: compare.map((c) => c.otherSponsors || null),
    });
  }
  rows.push({
    id: 'sum-sponsors',
    kind: 'subtotal',
    side: 'income',
    label: { key: 'sumSponsors' },
    count: core.sponsors.length,
    actual: core.sponsorTotal.actual,
    open: core.sponsorTotal.open,
    plan: plan ? plan.sponsorTotal : null,
    deviation: dev(core.sponsorTotal.actual + core.sponsorTotal.open, plan?.sponsorTotal),
    compare: compare.map((c) => c.sponsorTotal),
  });
  rows.push({
    id: 'sum-income',
    kind: 'total',
    side: 'income',
    label: { key: 'sumIncome' },
    actual: core.income.actual,
    open: core.income.open,
    plan: plan ? plan.income : null,
    deviation: dev(core.income.actual + core.income.open, plan?.income),
    compare: compare.map((c) => c.income),
  });

  rows.push({ id: 'expenses', kind: 'section', side: 'expense', label: { key: 'expenses' } });
  for (const g of core.groups) {
    const budget = plan ? (plan.groups[g.id] ?? null) : null;
    rows.push({
      id: `group-${g.id}`,
      kind: 'line',
      side: 'expense',
      label: { text: g.name },
      count: g.count,
      actual: g.actual,
      open: g.open,
      plan: budget,
      deviation: dev(g.actual + g.open, budget),
      compare: compare.map((c) => c.groups[g.id] ?? null),
      groupId: g.id,
    });
    for (const e of g.items) {
      rows.push({
        id: `expense-${e.id}`,
        kind: 'item',
        side: 'expense',
        label: { text: e.supplier ? `${e.supplier}: ${e.description}` : e.description },
        badge: { expense: e.status },
        actual: e.status === 'paid' ? e.amountCents : null,
        open: e.status === 'paid' ? null : e.amountCents,
        parentGroupId: g.id,
        date: e.spentOn,
      });
    }
  }
  // Kostengruppen, die es nur in einem Vergleichs-Event gab
  const otherNames = [...new Set(compare.flatMap((c) => c.otherGroups.map((g) => g.name)))];
  otherNames.forEach((name, i) => {
    rows.push({
      id: `group-other-${i}`,
      kind: 'line',
      side: 'expense',
      label: { text: name },
      badge: { compareOnly: true },
      actual: null,
      open: null,
      compare: compare.map((c) => c.otherGroups.find((g) => g.name === name)?.cents ?? null),
    });
  });
  rows.push({
    id: 'sum-expenses',
    kind: 'total',
    side: 'expense',
    label: { key: 'sumExpenses' },
    count: core.expenses.count,
    actual: core.expenses.actual,
    open: core.expenses.open,
    plan: plan ? plan.expenses : null,
    deviation: dev(core.expenses.actual + core.expenses.open, plan?.expenses),
    compare: compare.map((c) => c.expenses),
  });
  rows.push({
    id: 'result',
    kind: 'result',
    side: 'result',
    label: { key: 'result' },
    actual: core.result.actual,
    open: core.result.open,
    plan: plan ? plan.result : null,
    deviation: dev(core.result.actual + core.result.open, plan?.result),
    compare: compare.map((c) => c.result),
  });
  return rows;
}

/** Bezeichnung einer Preis-Aufschlüsselung, z. B. „Early Bird · 240,00 €“ oder „Code HERBST20 · 232,00 €“. */
export function variantLabel(
  v: Pick<TicketVariant, 'kind' | 'name' | 'priceCents'>,
  words: (kind: TicketVariant['kind'], name: string) => string,
  formatPrice: (cents: number) => string
): string {
  return `${words(v.kind, v.name ?? '')} · ${formatPrice(v.priceCents)}`;
}
