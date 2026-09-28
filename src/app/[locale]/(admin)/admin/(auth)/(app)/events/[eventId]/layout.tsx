import { getFormatter, getTranslations } from 'next-intl/server';
import { ArchiveToggle, CopyEventDialog } from '@/components/admin/event-actions';
import { EventPageHeader } from '@/components/admin/event-page-header';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { copySuggestion } from '@/lib/validation/event-values';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { registrationState } from '@/server/services/events';

const DAY_MS = 24 * 60 * 60_000;

/** Tage bis Beginn bzw. Phase des Events (außerhalb der Komponente: liest die aktuelle Zeit). */
function eventPhase(startsAt: string, endsAt: string): { phase: 'upcoming' | 'running' | 'past'; days: number } {
  const now = Date.now();
  const starts = new Date(startsAt).getTime();
  if (now > new Date(endsAt).getTime()) return { phase: 'past', days: 0 };
  if (now >= starts) return { phase: 'running', days: 0 };
  return { phase: 'upcoming', days: Math.ceil((starts - now) / DAY_MS) };
}

export default async function EventLayout({ children, params }: EventParams & { children: React.ReactNode }) {
  const locale = await initLocale(params);
  const { eventId } = await params;
  const { event } = await loadEvent(eventId);
  const t = await getTranslations('eventOverview');
  const tState = await getTranslations('registrationState');
  const format = await getFormatter();
  const state = registrationState(event);

  const { phase, days } = eventPhase(event.startsAt, event.endsAt);
  const closes = event.registrationClosesAt ?? event.startsAt;
  const timing = [
    phase === 'past' ? t('timingPast') : phase === 'running' ? t('timingRunning') : t('timingDays', { count: days }),
    state === 'open' ? t('timingCloses', { date: format.dateTime(new Date(closes), { dateStyle: 'medium' }) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      <EventPageHeader
        eventId={event.id}
        eventName={localized(event.name, locale)}
        state={{ label: tState(state), tone: state === 'open' ? 'open' : state === 'archived' ? 'archived' : 'neutral' }}
        timing={timing}
        actions={
          <>
            <CopyEventDialog eventId={event.id} suggestion={copySuggestion(event)} />
            <ArchiveToggle eventId={event.id} archived={Boolean(event.archivedAt)} />
          </>
        }
      />
      {event.archivedAt && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">{t('archivedNotice')}</p>
      )}
      {children}
    </div>
  );
}
