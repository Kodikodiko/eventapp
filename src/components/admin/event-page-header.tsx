'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

type Props = {
  eventId: number;
  eventName: string;
  /** Status der Anmeldung (bereits übersetzt) mit Farbton */
  state: { label: string; tone: 'open' | 'neutral' | 'archived' };
  /** z. B. „noch 227 Tage · Anmeldeschluss 05.05.2027“ */
  timing: string;
  /** Aktionen rechts (Kopieren, Archivieren), nur im Cockpit und in den Einstellungen */
  actions: React.ReactNode;
};

const SECTIONS = ['attendees', 'speakers', 'schedule', 'sponsors', 'invoices', 'refunds', 'settings', 'terms'] as const;
const SECTION_LABEL = {
  attendees: 'attendees',
  speakers: 'speakers',
  schedule: 'schedule',
  sponsors: 'sponsors',
  invoices: 'invoices',
  refunds: 'refunds',
  settings: 'eventSettings',
  terms: 'terms',
} as const;

/** Kopf der Event-Seiten: im Cockpit Eventname mit Status, sonst Eventname klein und Bereich als Überschrift. */
export function EventPageHeader({ eventId, eventName, state, timing, actions }: Props) {
  const t = useTranslations('adminNav');
  const pathname = usePathname();
  const base = `/admin/events/${eventId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).split('/').filter(Boolean) : [];
  const section = SECTIONS.find((s) => s === rest[0]);
  const isOverview = rest.length === 0;
  const badge = (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        state.tone === 'open' && 'bg-[#E7F4EC] text-[#17603C]',
        state.tone === 'neutral' && 'bg-muted text-muted-foreground',
        state.tone === 'archived' && 'bg-amber-100 text-amber-900'
      )}
    >
      {state.label}
    </span>
  );

  if (isOverview) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <h1 className="text-2xl font-extrabold sm:text-[28px]">{eventName}</h1>
          {badge}
          <span className="text-sm text-muted-foreground">{timing}</span>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {eventName}
          {state.tone === 'archived' && badge}
        </span>
        <h1 className="text-2xl font-extrabold">{section ? t(SECTION_LABEL[section]) : eventName}</h1>
      </div>
      {section === 'settings' && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
