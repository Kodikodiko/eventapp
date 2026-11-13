import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateOnly } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { cn } from '@/lib/utils';
import { isoWeek, type Pnl, type RegBucket } from '@/server/services/pnl';
import { RegistrationsChart, type ChartBucket } from './registrations-chart';
import { ResultChart } from './result-chart';

type Props = { eventId: number; eventName: string; pnl: Pnl; locale: Locale };

const MAX_ROWS = 6;
const MAX_OPEN = 5;

/** Übersicht der Erfolgsrechnung: momentaner Erfolg (Ist), Einnahmen/Ausgaben, Verlauf, Anmeldungen, offene Posten. */
export async function PnlOverview({ eventId, eventName, pnl, locale }: Props) {
  const t = await getTranslations('pnl');
  const { core, registrations: reg } = pnl;
  const euro = (cents: number) => formatEuro(cents, locale);
  const tableHref = (hash: string) => `/admin/events/${eventId}/pnl?view=table#${hash}`;
  const intl = locale === 'en' ? 'en-GB' : 'de-AT';
  const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);
  const shortDay = (day: string) => new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(utcDate(day));
  const shortMonth = (day: string) => new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' }).format(utcDate(day));
  const longMonth = (day: string) => new Intl.DateTimeFormat(intl, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(day));

  const incomeForecast = core.income.actual + core.income.open;
  const expenseForecast = core.expenses.actual + core.expenses.open;
  const scale = Math.max(1, incomeForecast, expenseForecast);
  const pct = (cents: number, of = scale) => `${Math.max(0, Math.min(100, (cents / of) * 100)).toFixed(1)}%`;

  // Einnahmen: Tickets gesamt, dann die größten Sponsoren
  const incomeRows = [
    { id: 'tickets', name: t('tickets'), actual: core.ticketTotal.actual, open: core.ticketTotal.open },
    ...[...core.sponsors]
      .sort((a, b) => b.actual + b.open - (a.actual + a.open))
      .map((s) => ({ id: `sponsor-${s.id}`, name: s.name, actual: s.actual, open: s.open })),
  ].filter((r) => r.actual !== 0 || r.open !== 0);
  const expenseRows = [...core.groups]
    .sort((a, b) => b.actual + b.open - (a.actual + a.open))
    .map((g) => ({ id: `group-${g.id}`, name: g.name, actual: g.actual, open: g.open }))
    .filter((r) => r.actual !== 0 || r.open !== 0);

  // Offene Posten
  const incomingOpen = [
    ...(core.ticketTotal.open > 0 ? [{ id: 'tickets', name: t('openTickets', { count: core.openTicketCount }), cents: core.ticketTotal.open }] : []),
    ...core.sponsors.filter((s) => s.open > 0).map((s) => ({ id: `sponsor-${s.id}`, name: s.name, cents: s.open })),
  ].sort((a, b) => b.cents - a.cents);
  const outgoingOpen = core.groups
    .flatMap((g) =>
      g.items
        .filter((e) => e.status !== 'paid')
        .map((e) => ({ id: `group-${g.id}`, key: e.id, name: e.supplier ? `${e.supplier}: ${e.description}` : e.description, sub: g.name, cents: e.amountCents }))
    )
    .sort((a, b) => b.cents - a.cents);

  const bucket = (unit: 'week' | 'month') => (b: RegBucket): ChartBucket =>
    unit === 'week'
      ? { label: t('reg.kw', { week: isoWeek(b.start) }), title: t('reg.kwFrom', { week: isoWeek(b.start), date: shortDay(b.start) }), current: b.current, previous: b.previous }
      : { label: shortMonth(b.start), title: longMonth(b.start), current: b.current, previous: b.previous };
  const compareName = reg.compare ? localized(reg.compare.name, locale) : null;
  const regDiff = reg.compare ? reg.total - reg.compare.totalAtSameDistance : 0;

  const h3 = 'text-sm font-semibold text-muted-foreground';
  const moreLink = 'text-[13px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring';

  return (
    <div className="rounded-xl border bg-card px-5 py-7 sm:px-9 sm:py-9">
      {/* Momentaner Erfolg */}
      <section aria-labelledby="pnl-now">
        <h2 id="pnl-now" className={h3}>
          {t('now')}
        </h2>
        <p className={cn('mt-1 font-display text-5xl font-extrabold tracking-tight tabular-nums sm:text-6xl', core.result.actual < 0 && 'text-destructive')}>
          {euro(core.result.actual)}
        </p>
      </section>

      {/* Geflossen und offen */}
      <section className="mt-9 grid gap-x-12 gap-y-6 md:grid-cols-2">
        {(
          [
            { key: 'income', title: t('income'), done: t('received'), a: core.income, bar: 'bg-primary', light: 'bg-primary/25', href: tableHref('income') },
            { key: 'expenses', title: t('expenses'), done: t('paid'), a: core.expenses, bar: 'bg-foreground/70', light: 'bg-foreground/20', href: tableHref('expenses') },
          ] as const
        ).map((s) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold">
                <Link href={s.href} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                  {s.title}
                </Link>
              </h3>
              <span className="text-xl font-bold tabular-nums">{euro(s.a.actual)}</span>
            </div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className={s.bar} style={{ width: pct(s.a.actual) }} />
              <span className={s.light} style={{ width: pct(Math.max(0, s.a.open)) }} />
            </div>
            <p className="mt-1.5 flex justify-between gap-3 text-[13px] text-muted-foreground">
              <span>{s.done}</span>
              <span className="tabular-nums">{t('stillOpen', { amount: euro(s.a.open) })}</span>
            </p>
          </div>
        ))}
      </section>

      {/* Woher und wohin */}
      <section className="mt-9 grid gap-x-12 gap-y-8 md:grid-cols-2">
        {(
          [
            { key: 'income', title: t('incomeBy'), rows: incomeRows, bar: 'bg-primary', light: 'bg-primary/25', empty: t('noIncome'), all: 'income' },
            { key: 'expenses', title: t('expensesBy'), rows: expenseRows, bar: 'bg-foreground/70', light: 'bg-foreground/20', empty: t('noExpenses'), all: 'expenses' },
          ] as const
        ).map((s) => {
          const max = Math.max(1, ...s.rows.map((r) => r.actual + Math.max(0, r.open)));
          return (
            <div key={s.key}>
              <h3 className={h3}>{s.title}</h3>
              {s.rows.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{s.empty}</p>
              ) : (
                <ul className="mt-2">
                  {s.rows.slice(0, MAX_ROWS).map((r) => (
                    <li key={r.id}>
                      <Link href={tableHref(r.id)} className="group block rounded-md py-1.5 focus-visible:outline-2 focus-visible:outline-ring">
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate group-hover:underline">{r.name}</span>
                          <span className="font-semibold tabular-nums">{euro(r.actual)}</span>
                        </span>
                        <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span className={s.bar} style={{ width: pct(r.actual, max) }} />
                          <span className={s.light} style={{ width: pct(Math.max(0, r.open), max) }} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {s.rows.length > MAX_ROWS && (
                <Link href={tableHref(s.all)} className={cn(moreLink, 'mt-2 inline-block')}>
                  {t('more', { count: s.rows.length - MAX_ROWS })}
                </Link>
              )}
            </div>
          );
        })}
      </section>

      {/* Verlauf und Anmeldungen */}
      <section className="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2">
        <div>
          <h3 className={h3}>{t('trend')}</h3>
          {pnl.timeline.length < 2 ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('noTrend')}</p>
          ) : (
            <div className="mt-3">
              <ResultChart points={pnl.timeline} label={t('trendAria')} formatValue={euro} formatDay={(d) => formatDateOnly(d, locale)} formatMonth={shortMonth} />
            </div>
          )}
        </div>
        <div>
          <h3 className={h3}>{t('reg.title')}</h3>
          <p className="mt-1 text-base font-semibold">
            {t('reg.total', { count: reg.total })}
            {reg.compare && (
              <span className="font-normal text-muted-foreground">
                {' · '}
                {regDiff === 0 ? t('reg.same', { name: compareName! }) : regDiff > 0 ? t('reg.more', { count: regDiff, name: compareName! }) : t('reg.fewer', { count: -regDiff, name: compareName! })}
              </span>
            )}
          </p>
          {reg.total === 0 && !reg.compare?.totalAtSameDistance ? (
            <p className="mt-3 text-sm text-muted-foreground">{t('reg.none')}</p>
          ) : (
            <div className="mt-3">
              <RegistrationsChart
                weeks={reg.weeks.map(bucket('week'))}
                months={reg.months.map(bucket('month'))}
                currentName={eventName}
                previousName={compareName}
                labels={{ unit: t('reg.unit'), week: t('reg.week'), month: t('reg.month'), weekNote: t('reg.weekNote'), monthNote: t('reg.monthNote'), aria: t('reg.aria') }}
              />
            </div>
          )}
          {!reg.compare && (
            <Link href={tableHref('compare')} className={cn(moreLink, 'mt-2 inline-block print:hidden')}>
              {t('reg.chooseCompare')}
            </Link>
          )}
        </div>
      </section>

      {/* Offene Posten */}
      <section className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-2">
        {(
          [
            { key: 'in', title: t('comingIn'), total: core.income.open, rows: incomingOpen.map((r) => ({ ...r, key: r.id, sub: null as string | null })), empty: t('nothingOpenIn'), all: 'income' },
            { key: 'out', title: t('goingOut'), total: core.expenses.open, rows: outgoingOpen, empty: t('nothingOpenOut'), all: 'expenses' },
          ] as const
        ).map((s) => (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className={h3}>{s.title}</h3>
              {s.rows.length > 0 && <span className="text-sm font-semibold tabular-nums">{euro(s.total)}</span>}
            </div>
            {s.rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{s.empty}</p>
            ) : (
              <ul className="mt-2 divide-y">
                {s.rows.slice(0, MAX_OPEN).map((r) => (
                  <li key={r.key}>
                    <Link href={tableHref(r.id)} className="group flex items-baseline justify-between gap-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">
                      <span className="min-w-0">
                        <span className="block truncate group-hover:underline">{r.name}</span>
                        {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                      </span>
                      <span className="tabular-nums">{euro(r.cents)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {s.rows.length > MAX_OPEN && (
              <Link href={tableHref(s.all)} className={cn(moreLink, 'mt-2 inline-block')}>
                {t('more', { count: s.rows.length - MAX_OPEN })}
              </Link>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
