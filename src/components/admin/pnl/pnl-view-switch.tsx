import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type Props = { eventId: number; view: 'overview' | 'table'; labels: { group: string; overview: string; table: string } };

/** Umschalter Übersicht/Tabelle – feste Breiten, damit er beim Wechsel nicht springt. */
export function PnlViewSwitch({ eventId, view, labels }: Props) {
  const base = `/admin/events/${eventId}/pnl`;
  const item = (active: boolean) =>
    cn(
      'inline-flex h-9 w-28 items-center justify-center rounded-md text-sm focus-visible:outline-2 focus-visible:outline-ring',
      active ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    );
  return (
    <nav aria-label={labels.group} className="inline-flex gap-1 rounded-lg bg-muted p-1 print:hidden">
      <Link href={base} aria-current={view === 'overview' ? 'page' : undefined} className={item(view === 'overview')}>
        {labels.overview}
      </Link>
      <Link href={`${base}?view=table`} aria-current={view === 'table' ? 'page' : undefined} className={item(view === 'table')}>
        {labels.table}
      </Link>
    </nav>
  );
}
