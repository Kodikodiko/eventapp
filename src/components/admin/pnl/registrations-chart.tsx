'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type ChartBucket = { label: string; title: string; current: number; previous: number | null };

type Props = {
  weeks: ChartBucket[];
  months: ChartBucket[];
  currentName: string;
  previousName: string | null;
  labels: { unit: string; week: string; month: string; weekNote: string; monthNote: string; aria: string };
};

const W = 496;
const H = 170;
const LEFT = 16;
const RIGHT = 456;
const TOP = 22;
const BASE = 140;

/** Liniendiagramm: neue Anmeldungen je Woche oder Monat, aktuelles Event (kräftig) gegen Vergleichs-Event (grau). */
export function RegistrationsChart({ weeks, months, currentName, previousName, labels }: Props) {
  const [unit, setUnit] = useState<'week' | 'month'>('week');
  const buckets = unit === 'week' ? weeks : months;
  const hasPrevious = previousName != null && buckets.some((b) => b.previous != null);
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.current, b.previous ?? 0)));
  const x = (i: number) => (buckets.length === 1 ? (LEFT + RIGHT) / 2 : LEFT + ((RIGHT - LEFT) * i) / (buckets.length - 1));
  const y = (n: number) => BASE - (n / max) * (BASE - TOP);
  const line = (pick: (b: ChartBucket) => number) => buckets.map((b, i) => `${x(i).toFixed(1)},${y(pick(b)).toFixed(1)}`).join(' ');
  const lastIndex = buckets.length - 1;
  const last = buckets[lastIndex];
  // Endbeschriftungen auseinanderhalten, wenn die Linien nah beieinander enden
  let currentLabelY = last ? y(last.current) + 4 : 0;
  let previousLabelY = last && last.previous != null ? y(last.previous) + 4 : 0;
  if (last && hasPrevious && Math.abs(currentLabelY - previousLabelY) < 14) {
    const up = last.current >= (last.previous ?? 0);
    currentLabelY += up ? -7 : 7;
    previousLabelY += up ? 7 : -7;
  }
  // höchstens etwa sieben Achsenbeschriftungen, die letzte immer
  const step = Math.max(1, Math.ceil(buckets.length / 7));
  const showLabel = (i: number) => i === lastIndex || ((lastIndex - i) % step === 0 && lastIndex - i >= step);
  const showValues = buckets.length <= 6;

  const tab = (active: boolean) =>
    cn('h-8 rounded-md px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-ring', active ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground');

  return (
    <div className="space-y-2.5">
      <div role="group" aria-label={labels.unit} className="inline-flex gap-1 rounded-lg bg-muted p-1 print:hidden">
        <button type="button" aria-pressed={unit === 'week'} onClick={() => setUnit('week')} className={tab(unit === 'week')}>
          {labels.week}
        </button>
        <button type="button" aria-pressed={unit === 'month'} onClick={() => setUnit('month')} className={tab(unit === 'month')}>
          {labels.month}
        </button>
      </div>
      <svg role="img" aria-label={labels.aria} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <line x1={0} y1={BASE} x2={W - 16} y2={BASE} className="stroke-input" strokeWidth={1} />
        {hasPrevious && (
          <polyline points={line((b) => b.previous ?? 0)} fill="none" className="stroke-muted-foreground/45" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        <polyline points={line((b) => b.current)} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {buckets.map((b, i) => (
          <g key={b.title}>
            {showValues && hasPrevious && b.previous != null && i !== lastIndex && (
              <circle cx={x(i)} cy={y(b.previous)} r={3.5} className="fill-muted-foreground/60 stroke-card" strokeWidth={2} />
            )}
            {showValues && i !== lastIndex && <circle cx={x(i)} cy={y(b.current)} r={4} className="fill-primary stroke-card" strokeWidth={2} />}
            {showValues && i !== lastIndex && (
              <text x={x(i)} y={y(b.current) - 9} textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
                {b.current}
              </text>
            )}
            {showLabel(i) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {b.label}
              </text>
            )}
          </g>
        ))}
        {last && hasPrevious && last.previous != null && (
          <>
            <circle cx={x(lastIndex)} cy={y(last.previous)} r={4} className="fill-muted-foreground/60 stroke-card" strokeWidth={2} />
            <text x={x(lastIndex) + 10} y={previousLabelY} className="fill-muted-foreground text-[12px]">
              {last.previous}
            </text>
          </>
        )}
        {last && (
          <>
            <circle cx={x(lastIndex)} cy={y(last.current)} r={5} className="fill-primary stroke-card" strokeWidth={2} />
            <text x={x(lastIndex) + 10} y={currentLabelY} className="fill-foreground text-[13px] font-bold">
              {last.current}
            </text>
          </>
        )}
        {buckets.map((b, i) => (
          <rect key={`hit-${b.title}`} x={x(i) - 12} y={TOP - 10} width={24} height={BASE - TOP + 14} fill="transparent">
            <title>{`${b.title}: ${b.current}${hasPrevious && b.previous != null ? ` · ${previousName}: ${b.previous}` : ''}`}</title>
          </rect>
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-[3px] w-4 rounded bg-primary" />
          {currentName}
        </span>
        {hasPrevious && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-[3px] w-4 rounded bg-muted-foreground/45" />
            {previousName}
          </span>
        )}
        <span>{unit === 'week' ? labels.weekNote : labels.monthNote}</span>
      </div>
    </div>
  );
}
