'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { SeatTone, SeatUsage } from '@/lib/seat-usage';
import { cn } from '@/lib/utils';

const toneText: Record<SeatTone, string> = {
  ok: 'text-[#17603C]',
  few: 'text-[#B45309]',
  full: 'text-[#B42318]',
  over: 'text-[#B42318]',
};

const HELD_BG = 'repeating-linear-gradient(135deg, hsl(var(--primary)) 0 3px, #B9B1EA 3px 6px)';
const OVER_BG = 'repeating-linear-gradient(135deg, #B42318 0 3px, #F2B8B3 3px 6px)';

type Segment = { key: string; label: string; count: number; className?: string; style?: React.CSSProperties };

/**
 * Belegungsleiste über den Reitern der Teilnehmerliste (Entwurf B, 19.11.2026):
 * freie Plätze groß, Balken nach Rolle, Überbuchung ragt über die Kapazitätsmarke hinaus.
 */
export function SeatUsageBar({ usage, settingsHref, onShowWaitlist }: { usage: SeatUsage; settingsHref: string | null; onShowWaitlist: () => void }) {
  const t = useTranslations('attendees.seats');
  const u = usage;
  const base = Math.max(1, u.capacity, u.taken);
  const pct = (n: number) => `${(n / base) * 100}%`;

  const segments: Segment[] = [
    { key: 'attendee', label: t('attendee'), count: u.attendee, className: 'bg-primary' },
    { key: 'speaker', label: t('speaker'), count: u.speaker, className: 'bg-chart-3' },
    { key: 'orga', label: t('orga'), count: u.orga, className: 'bg-[#8F84D6]' },
    { key: 'other', label: t('other'), count: u.other, className: 'bg-chart-4' },
    { key: 'held', label: t('held'), count: u.held, style: { background: HELD_BG } },
  ];
  // Bei Überbuchung füllen die Rollen den Balken bis zur Kapazität, der Rest ist schraffiert rot
  let left = u.over > 0 ? u.capacity : Infinity;
  const drawn = segments.map((s) => {
    const n = Math.min(s.count, left);
    left -= n;
    return { ...s, n };
  });
  const legend: Segment[] = [
    ...segments.filter((s) => s.count > 0 || s.key === 'attendee' || s.key === 'speaker'),
    u.over > 0
      ? { key: 'over', label: t('overLegend'), count: u.over, style: { background: OVER_BG } }
      : { key: 'free', label: t('freeLegend'), count: u.free, className: 'bg-muted border' },
  ];

  const big = u.over > 0 ? `+${u.over}` : String(u.free);
  const caption = u.over > 0 ? t('overCaption') : u.free === 0 ? t('fullCaption') : t('freeCaption', { count: u.free });
  const waitParts = [u.waiting > 0 ? t('waiting', { count: u.waiting }) : null, u.offered > 0 ? t('offered', { count: u.offered }) : null].filter(Boolean);

  return (
    <section
      className="grid gap-x-6 gap-y-3 rounded-xl border bg-card px-4 py-3.5 sm:px-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
      aria-label={t('label')}
    >
      <div className="flex items-baseline gap-2 border-b pb-2.5 md:grid md:gap-0.5 md:border-r md:border-b-0 md:pr-6 md:pb-0">
        <strong className={cn('font-display text-3xl leading-none font-extrabold tabular-nums', toneText[u.tone])}>{big}</strong>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>

      <div className="grid min-w-0 gap-2.5">
        <div className="relative">
          <div
            className="flex h-3 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={t('barLabel', { taken: u.taken, capacity: u.capacity })}
          >
            {drawn.map((s) => (s.n > 0 ? <span key={s.key} className={cn('h-full', s.className)} style={{ ...s.style, width: pct(s.n) }} /> : null))}
            {u.over > 0 && <span className="h-full" style={{ background: OVER_BG, width: pct(u.over) }} />}
          </div>
          {u.over > 0 && (
            <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-foreground" style={{ left: `calc(${pct(u.capacity)} - 1px)` }} title={t('capacityMark', { capacity: u.capacity })} />
          )}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <i aria-hidden className={cn('inline-block size-2.5 rounded-[3px]', s.className)} style={s.style} />
              {s.label} <b className="font-semibold text-foreground tabular-nums">{s.count}</b>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm md:grid md:justify-items-end md:gap-1.5">
        <span className="tabular-nums">{t.rich('taken', { taken: u.taken, capacity: u.capacity, b: (c) => <b className="font-semibold">{c}</b> })}</span>
        {waitParts.length > 0 ? (
          <button type="button" onClick={onShowWaitlist} className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-primary underline-offset-4 hover:underline">
            {waitParts.join(' · ')} <ArrowRight className="size-3.5" aria-hidden />
          </button>
        ) : (
          <span className="text-muted-foreground">{t('noWaitlist')}</span>
        )}
        {settingsHref && (
          <Link href={settingsHref} className="whitespace-nowrap text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t('changeCapacity')}
          </Link>
        )}
      </div>
    </section>
  );
}
