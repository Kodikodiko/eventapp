/**
 * Programmraster eines Tages: Spalten = Streams, Zeilen = Beginnzeiten. Programmpunkte über mehrere Streams
 * (z. B. Keynote) gehen über die entsprechende Breite. Ohne Hooks – nutzbar in Server- und Client-Komponenten.
 */
import { cn } from '@/lib/utils';

export type GridStream = { position: number; label: string };
export type GridItem = { id: number; startsAt: string; stream: number; streamTo: number; content: React.ReactNode; className?: string };

export function ProgramGrid({
  streams,
  items,
  timeLabel,
  timeHeader,
  className,
}: {
  streams: GridStream[];
  items: GridItem[];
  timeLabel: (iso: string) => string;
  timeHeader: string;
  className?: string;
}) {
  const count = Math.max(1, streams.length);
  const slots = [...new Set(items.map((i) => i.startsAt))].sort();
  const row = new Map(slots.map((s, i) => [s, i + 2]));
  return (
    <div className={cn('overflow-x-auto print:overflow-visible', className)}>
      <div
        role="table"
        className="grid gap-2 print:gap-1"
        style={{ gridTemplateColumns: `4.5rem repeat(${count}, minmax(${count > 1 ? '9rem' : '0'}, 1fr))`, minWidth: count > 2 ? `${4.5 + count * 9.5}rem` : undefined }}
      >
        <div role="columnheader" className="text-xs font-semibold text-muted-foreground" style={{ gridColumn: 1, gridRow: 1 }}>
          {timeHeader}
        </div>
        {streams.map((s) => (
          <div key={s.position} role="columnheader" className="truncate border-b pb-1 text-sm font-semibold" style={{ gridColumn: s.position + 1, gridRow: 1 }}>
            {s.label}
          </div>
        ))}
        {slots.map((slot) => (
          <div key={slot} className="pt-2 text-sm font-medium tabular-nums" style={{ gridColumn: 1, gridRow: row.get(slot) }}>
            {timeLabel(slot)}
          </div>
        ))}
        {items.map((i) => (
          <div
            key={i.id}
            className={cn('min-w-0 break-inside-avoid rounded-md border p-3 print:p-1.5', i.className)}
            style={{ gridColumn: `${Math.min(i.stream, count) + 1} / ${Math.min(Math.max(i.streamTo, i.stream), count) + 2}`, gridRow: row.get(i.startsAt) }}
          >
            {i.content}
          </div>
        ))}
      </div>
    </div>
  );
}
