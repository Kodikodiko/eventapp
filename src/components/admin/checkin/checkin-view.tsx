'use client';

import { Check, Search, UserPlus, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { setCheckedInAction } from '@/server/actions/registrations';
import type { CheckInRow } from '@/server/services/checkin';
import { useActionFeedback } from '../use-action-feedback';

type Props = { eventId: number; rows: CheckInRow[]; roleLabels: Record<string, string>; readOnly: boolean };

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Check-in am Eventtag (neu, UI-Redesign 18.11.2026): für Handy und Tablet am Einlass.
 * Suche nach Name oder Firma, ein Tipp checkt ein, „Rückgängig“ bleibt einige Sekunden stehen.
 */
export function CheckInView({ eventId, rows, roleLabels, readOnly }: Props) {
  const t = useTranslations('checkin');
  const format = useFormatter();
  const router = useRouter();
  const handle = useActionFeedback();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  // sofort sichtbarer Zustand; der Server bestätigt im Hintergrund
  const [local, setLocal] = useState<Map<number, string | null>>(new Map());
  const [last, setLast] = useState<{ id: number; name: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const state = (r: CheckInRow) => (local.has(r.id) ? local.get(r.id)! : r.checkedInAt);
  const present = rows.filter((r) => state(r)).length;
  const percent = rows.length ? Math.round((present / rows.length) * 100) : 0;

  const visible = useMemo(() => {
    const q = fold(query.trim());
    return rows.filter((r) => {
      if (onlyOpen && !q && (local.has(r.id) ? local.get(r.id) : r.checkedInAt)) return false;
      return !q || fold(`${r.firstName} ${r.lastName} ${r.lastName} ${r.firstName} ${r.company ?? ''}`).includes(q);
    });
  }, [rows, query, onlyOpen, local]);

  useEffect(() => {
    if (!last) return;
    const id = window.setTimeout(() => setLast(null), 6000);
    return () => window.clearTimeout(id);
  }, [last]);

  function toggle(r: CheckInRow, next: boolean) {
    const name = `${r.firstName} ${r.lastName}`;
    setLocal((m) => new Map(m).set(r.id, next ? new Date().toISOString() : null));
    if (next) {
      setLast({ id: r.id, name });
      setQuery('');
      searchRef.current?.focus();
    } else setLast(null);
    startTransition(async () => {
      const result = await setCheckedInAction(r.id, next);
      if (handle(result)) {
        setLocal((m) => new Map(m).set(r.id, result.data.checkedInAt));
        router.refresh();
      } else {
        setLocal((m) => {
          const copy = new Map(m);
          copy.delete(r.id);
          return copy;
        });
      }
    });
  }

  const time = (iso: string) => format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 pb-24">
      <section aria-live="polite" className="rounded-2xl bg-[#15172B] p-5 text-white shadow-sm">
        <p className="text-sm text-white/70">{t('counterLabel')}</p>
        <p className="mt-1 flex items-end gap-2">
          <span className="font-display text-5xl leading-none font-extrabold tabular-nums">{present}</span>
          <span className="mb-1 text-white/75">{t('of', { total: rows.length })}</span>
          <span className="mb-1 ml-auto text-sm text-white/75 tabular-nums">{percent} %</span>
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#7BE0A8] transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <div className="sticky top-[68px] z-10 flex flex-col gap-2 bg-canvas/95 py-1 backdrop-blur">
        <label className="flex h-12 items-center gap-2 rounded-xl border border-input bg-card px-3 text-base shadow-sm focus-within:outline-2 focus-within:outline-ring">
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter: bei genau einem Treffer direkt einchecken
              if (e.key === 'Enter' && visible.length === 1 && !state(visible[0]) && !readOnly) toggle(visible[0], true);
            }}
            placeholder={t('search')}
            aria-label={t('search')}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <div className="flex items-center justify-between gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            {t('onlyOpen')}
          </label>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => router.push(`/admin/events/${eventId}/attendees?new=1&n=${Date.now()}`)}>
              <UserPlus aria-hidden />
              {t('walkIn')}
            </Button>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-1.5">
        {visible.map((r) => {
          const at = state(r);
          return (
            <li key={r.id} className={cn('flex items-center gap-3 rounded-xl px-3.5 py-3 shadow-sm', at ? 'bg-card/60' : 'bg-card')}>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate font-semibold', at && 'text-muted-foreground')}>
                  {r.firstName} {r.lastName}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[r.company, ...r.roles.filter((k) => k !== 'attendee').map((k) => roleLabels[k] ?? k)].filter(Boolean).join(' · ') || '–'}
                  {r.paymentOpen && <span className="ml-1 font-semibold text-amber-700">· {t('paymentOpen')}</span>}
                </span>
              </span>
              {at ? (
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => toggle(r, false)}
                  title={t('undoHint')}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-[#17603C] hover:bg-muted"
                >
                  <Check aria-hidden className="size-4" />
                  {time(at)}
                </button>
              ) : (
                <Button disabled={readOnly} onClick={() => toggle(r, true)} className="h-10 rounded-lg px-4 font-bold">
                  {t('checkIn')}
                </Button>
              )}
            </li>
          );
        })}
        {visible.length === 0 && <li className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{query ? t('noMatch') : t('allIn')}</li>}
      </ul>

      {last && (
        <div role="status" className="fixed inset-x-4 bottom-5 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#15172B] px-4 py-3 text-sm text-white shadow-lg lg:left-[248px]">
          <Check aria-hidden className="size-5 text-[#7BE0A8]" />
          <span className="flex-1">{t('done', { name: last.name })}</span>
          <button
            type="button"
            className="font-semibold underline underline-offset-4"
            onClick={() => {
              const r = rows.find((x) => x.id === last.id);
              if (r) toggle(r, false);
            }}
          >
            {t('undo')}
          </button>
          <button type="button" aria-label={t('close')} onClick={() => setLast(null)} className="rounded p-1 text-white/70 hover:bg-white/10">
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
