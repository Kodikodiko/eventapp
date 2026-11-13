'use client';

import { ChevronRight, FileSpreadsheet, Pencil, Printer } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { formatDateOnly } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { formatAmount, formatSignedAmount } from '@/lib/money';
import { buildPnlRows, forecastOf, type PnlRow } from '@/lib/pnl-rows';
import { cn } from '@/lib/utils';
import { MAX_COMPARE_EVENTS, PLAN_VARIANT_KEYS, type PlanVariant } from '@/lib/validation/pnl';
import { setComparisonsAction } from '@/server/actions/pnl';
import type { Pnl } from '@/server/services/pnl';
import { useActionFeedback } from '../use-action-feedback';
import { PlanDialog } from './plan-dialog';

// --- Anzeige-Einstellungen (je Browser gemerkt, Standard: aus) ---
const listeners = new Set<() => void>();
function flagStore(key: string) {
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get(): boolean {
      try {
        return window.localStorage.getItem(key) === '1';
      } catch {
        return false;
      }
    },
    set(value: boolean) {
      try {
        window.localStorage.setItem(key, value ? '1' : '0');
      } catch {
        /* Speicher nicht verfügbar */
      }
      listeners.forEach((l) => l());
    },
  };
}
const planStore = flagStore('eventflow.pnl.plan');
const compareStore = flagStore('eventflow.pnl.compare');

// --- Sprungziel aus der Adresse (#group-3), auch nach einem Wechsel aus der Übersicht ---
const hashStore = {
  subscribe(listener: () => void) {
    window.addEventListener('hashchange', listener);
    // die Adresse wird bei einer Navigation erst nach dem Rendern gesetzt
    const timer = window.setTimeout(listener, 0);
    return () => {
      window.removeEventListener('hashchange', listener);
      window.clearTimeout(timer);
    };
  },
  get: () => window.location.hash.slice(1),
};

const selectClass =
  'h-9 rounded-md border border-input bg-card px-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60';

type Props = { eventId: number; pnl: Pnl; readOnly: boolean };

/** Erfolgsrechnung als Tabelle: Ist (hervorgehoben), Offen, Prognose; Plan und Vergleich zuschaltbar. */
export function PnlTable({ eventId, pnl, readOnly }: Props) {
  const t = useTranslations('pnl');
  const tSponsor = useTranslations('sponsors');
  const tExpense = useTranslations('expenses');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();

  const showPlan = useSyncExternalStore(planStore.subscribe, planStore.get, () => false);
  const showCompare = useSyncExternalStore(compareStore.subscribe, compareStore.get, () => false);
  const hash = useSyncExternalStore(hashStore.subscribe, hashStore.get, () => '');
  const [variant, setVariant] = useState<PlanVariant>('plan');
  const [toggled, setToggled] = useState<Record<number, boolean>>({});
  const [planOpen, setPlanOpen] = useState(false);

  const hashGroup = /^group-(\d+)$/.exec(hash)?.[1];
  const isOpen = (groupId: number) => toggled[groupId] ?? String(groupId) === hashGroup;

  useEffect(() => {
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'center' });
  }, [hash]);

  const compare = showCompare || hash === 'compare' ? pnl.compare : [];
  const compareOn = showCompare || hash === 'compare';
  const rows = buildPnlRows(pnl, variant);
  const hasPlan = pnl.plans[variant].figures !== null;
  const amount = (cents: number) => formatAmount(cents, locale);
  const cell = (v: number | null | undefined) => (v === undefined ? '' : v === null ? '–' : amount(v));
  const colCount = 5 + (showPlan ? 2 : 0) + compare.length;

  function saveCompare(index: number, value: string) {
    const ids = pnl.compare.map((c) => c.eventId);
    if (value) ids[index] = Number(value);
    else ids.splice(index, 1);
    const unique = [...new Set(ids)].slice(0, MAX_COMPARE_EVENTS);
    startTransition(async () => {
      if (handle(await setComparisonsAction(eventId, unique))) router.refresh();
    });
  }

  function label(row: PnlRow): string {
    if ('text' in row.label) return row.label.text;
    if ('ticket' in row.label) return t(`ticket.${row.label.ticket}`);
    return t(`row.${row.label.key}`);
  }
  function badge(row: PnlRow): string | null {
    if (!row.badge) return null;
    if ('sponsor' in row.badge) return tSponsor(`payment.${row.badge.sponsor}`);
    if ('expense' in row.badge) return tExpense(`status.${row.badge.expense}`);
    return t('compareOnly');
  }
  function deviationClass(row: PnlRow): string {
    if (!row.deviation) return 'text-muted-foreground';
    const good = row.side === 'expense' ? row.deviation < 0 : row.deviation > 0;
    return good ? 'text-emerald-700' : 'text-destructive';
  }

  const toggle = (on: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring',
      on ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-input bg-card text-muted-foreground hover:text-foreground'
    );
  const num = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';
  const ist = 'bg-primary/[0.06] font-semibold text-foreground';

  return (
    <div className="space-y-4">
      {/* Steuerung */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" aria-pressed={showPlan} onClick={() => planStore.set(!showPlan)} className={toggle(showPlan)}>
          {t('togglePlan')}
        </button>
        <button type="button" id="compare" aria-pressed={compareOn} onClick={() => compareStore.set(!showCompare)} className={toggle(compareOn)}>
          {t('toggleCompare')}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/export/pnl?event=${eventId}&locale=${locale}&variant=${variant}`}>
              <FileSpreadsheet aria-hidden className="size-4" />
              {t('excel')}
            </a>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden className="size-4" />
            {t('print')}
          </Button>
        </div>
      </div>

      {(showPlan || compareOn) && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded-xl border bg-card px-4 py-3 print:hidden">
          {showPlan && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                {t('variantLabel')}
                <select className={selectClass} value={variant} onChange={(e) => setVariant(e.target.value as PlanVariant)}>
                  {PLAN_VARIANT_KEYS.map((v) => (
                    <option key={v} value={v}>
                      {t(`variant.${v}`)}
                      {pnl.plans[v].values.exists ? '' : ` (${t('variantEmpty')})`}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="outline" size="sm" className="h-9" onClick={() => setPlanOpen(true)}>
                <Pencil aria-hidden className="size-4" />
                {readOnly ? t('viewPlan') : t('editPlan')}
              </Button>
              {!hasPlan && <span className="pb-2 text-[13px] text-muted-foreground">{t('noPlan')}</span>}
            </div>
          )}
          {compareOn && (
            <div className="flex flex-wrap items-end gap-2">
              {Array.from({ length: Math.min(MAX_COMPARE_EVENTS, pnl.compare.length + 1) }, (_, i) => (
                <label key={i} className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t('compareWith', { n: i + 1 })}
                  <select className={selectClass} disabled={pending} value={pnl.compare[i]?.eventId ?? ''} onChange={(e) => saveCompare(i, e.target.value)}>
                    <option value="">{t('compareNone')}</option>
                    {pnl.candidates
                      .filter((c) => c.id === pnl.compare[i]?.eventId || !pnl.compare.some((x) => x.eventId === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {localized(c.name, locale)}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              {pnl.candidates.length === 0 && <span className="pb-2 text-[13px] text-muted-foreground">{t('noCandidates')}</span>}
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card print:overflow-visible print:border-0">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">{t('title')}</caption>
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 text-left font-medium">
                {t('col.item')}
              </th>
              <th scope="col" className={cn(num, 'font-medium')}>
                {t('col.count')}
              </th>
              <th scope="col" className={cn(num, ist, 'text-sm')}>
                {t('col.actual')}
              </th>
              <th scope="col" className={cn(num, 'font-medium')}>
                {t('col.open')}
              </th>
              <th scope="col" className={cn(num, 'font-medium')}>
                {t('col.forecast')}
              </th>
              {showPlan && (
                <>
                  <th scope="col" className={cn(num, 'border-l font-medium')}>
                    {t(`variant.${variant}`)}
                  </th>
                  <th scope="col" className={cn(num, 'font-medium')}>
                    {t('col.deviation')}
                  </th>
                </>
              )}
              {compare.map((c, i) => (
                <th key={c.eventId} scope="col" className={cn(num, 'max-w-40 truncate font-medium', i === 0 && 'border-l')} title={t('col.compareHint')}>
                  {localized(c.name, locale)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              if (row.badge && 'compareOnly' in row.badge && compare.length === 0) return null;
              if (row.parentGroupId !== undefined && !isOpen(row.parentGroupId)) return null;
              if (row.kind === 'section') {
                return (
                  <tr key={row.id} id={row.id} className="scroll-mt-24">
                    <th scope="colgroup" colSpan={colCount} className="px-4 pt-6 pb-2 text-left font-display text-base font-bold">
                      {label(row)}
                    </th>
                  </tr>
                );
              }
              if (row.kind === 'heading') {
                return (
                  <tr key={row.id} id={row.id} className="scroll-mt-24">
                    <th scope="colgroup" colSpan={colCount} className="px-4 pt-3 pb-1 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {label(row)}
                    </th>
                  </tr>
                );
              }
              const strong = row.kind === 'subtotal' || row.kind === 'total' || row.kind === 'result';
              const hasValues = row.actual != null || row.open != null;
              const b = badge(row);
              const expandable = row.groupId !== undefined && (row.count ?? 0) > 0;
              const open = row.groupId !== undefined && isOpen(row.groupId);
              const sub = typeof row.sub === 'string' ? row.sub : row.sub ? localized(row.sub, locale) : null;
              return (
                <tr
                  key={row.id}
                  id={row.id}
                  className={cn(
                    'scroll-mt-24 border-t border-border/60',
                    strong && 'font-semibold',
                    row.kind === 'total' && 'border-t-foreground/30',
                    row.kind === 'result' && 'border-t-2 border-t-foreground text-base',
                    row.kind === 'item' && 'text-[13px] text-muted-foreground',
                    hash === row.id && 'bg-primary/[0.04]'
                  )}
                >
                  <th scope="row" className={cn('px-4 py-2 text-left', strong ? 'font-semibold' : 'font-normal', row.kind === 'item' && 'pl-11')}>
                    {expandable ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setToggled((s) => ({ ...s, [row.groupId!]: !open }))}
                        className="-ml-1.5 inline-flex items-center gap-1.5 rounded px-1 text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <ChevronRight aria-hidden className={cn('size-4 shrink-0 text-muted-foreground transition-transform print:hidden', open && 'rotate-90')} />
                        {label(row)}
                      </button>
                    ) : (
                      <span className={cn(row.groupId !== undefined && 'pl-5')}>{label(row)}</span>
                    )}
                    {row.date && <span className="ml-2 text-xs">{formatDateOnly(row.date, locale)}</span>}
                    {sub && <span className="ml-2 text-xs text-muted-foreground">{sub}</span>}
                    {b && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{b}</span>}
                  </th>
                  <td className={num}>{row.count ?? ''}</td>
                  <td className={cn(num, ist, row.kind === 'item' && 'font-normal', row.kind === 'result' && (row.actual ?? 0) < 0 && 'text-destructive')}>{cell(row.actual)}</td>
                  <td className={num}>{cell(row.open)}</td>
                  <td className={num}>{hasValues ? amount(forecastOf(row)) : row.actual === null ? '–' : ''}</td>
                  {showPlan && (
                    <>
                      <td className={cn(num, 'border-l')}>{row.kind === 'item' ? '' : cell(row.plan)}</td>
                      <td className={cn(num, deviationClass(row))}>{row.deviation === undefined || !hasPlan ? '' : formatSignedAmount(row.deviation, locale)}</td>
                    </>
                  )}
                  {compare.map((c, i) => (
                    <td key={c.eventId} className={cn(num, 'text-muted-foreground', i === 0 && 'border-l')}>
                      {row.compare ? cell(row.compare[pnl.compare.indexOf(c)]) : ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('legend')}</p>

      {planOpen && <PlanDialog eventId={eventId} pnl={pnl} initialVariant={variant} readOnly={readOnly} onClose={() => setPlanOpen(false)} />}
    </div>
  );
}
