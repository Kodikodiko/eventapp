import type { TimelinePoint } from '@/server/services/pnl';

type Props = {
  points: TimelinePoint[];
  /** Beschreibung für Screenreader */
  label: string;
  formatValue: (cents: number) => string;
  formatDay: (day: string) => string;
  formatMonth: (day: string) => string;
};

const W = 480;
const H = 176;
const LEFT = 8;
const RIGHT = 440;
const TOP = 30;
const BOTTOM = 140;

/** Liniendiagramm: aufgelaufenes Ist-Ergebnis je Woche. Nulllinie, Endwert direkt an der Linie. */
export function ResultChart({ points, label, formatValue, formatDay, formatMonth }: Props) {
  const values = points.map((p) => p.cents);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? RIGHT : LEFT + ((RIGHT - LEFT) * i) / (points.length - 1));
  const y = (cents: number) => BOTTOM - ((cents - min) / span) * (BOTTOM - TOP);
  const last = points[points.length - 1];
  const lastX = x(points.length - 1);
  const lastY = y(last.cents);
  // Monatsbeschriftung am ersten Punkt jedes Monats, nicht zu dicht
  const monthLabels: { x: number; text: string }[] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.day.slice(0, 7) === points[i - 1].day.slice(0, 7)) return;
    const px = x(i);
    if (monthLabels.length && px - monthLabels[monthLabels.length - 1].x < 44) return;
    monthLabels.push({ x: px, text: formatMonth(p.day) });
  });
  const zeroY = y(0);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} className="stroke-input" strokeWidth={1} />
      <text x={W} y={zeroY - 5} textAnchor="end" className="fill-muted-foreground text-[11px]">
        {formatValue(0)}
      </text>
      <polyline
        points={points.map((p, i) => `${x(i).toFixed(1)},${y(p.cents).toFixed(1)}`).join(' ')}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={lastX} cy={lastY} r={5} className="fill-primary stroke-card" strokeWidth={2} />
      <text x={lastX - 10} y={Math.max(14, lastY - 10)} textAnchor="end" className="fill-foreground text-[13px] font-bold">
        {formatValue(last.cents)}
      </text>
      {monthLabels.map((m, i) => (
        <text key={i} x={m.x} y={H - 6} textAnchor={i === 0 ? 'start' : 'middle'} className="fill-muted-foreground text-[11px]">
          {m.text}
        </text>
      ))}
      {/* große, unsichtbare Trefferflächen mit dem genauen Wert */}
      {points.map((p, i) => (
        <circle key={p.day + i} cx={x(i)} cy={y(p.cents)} r={10} fill="transparent">
          <title>{`${formatDay(p.day)}: ${formatValue(p.cents)}`}</title>
        </circle>
      ))}
    </svg>
  );
}
