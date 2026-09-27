import { getTranslations } from 'next-intl/server';
import { ScheduleView } from '@/components/admin/program/schedule-view';
import { initLocale } from '@/i18n/page';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { listSessions, listSpeakers } from '@/server/services/program';

export default async function SchedulePage({ params }: EventParams) {
  await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('schedule');
  const speakers = listSpeakers(db, event.id).map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }));
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <ScheduleView
        eventId={event.id}
        eventStartsAt={event.startsAt}
        sessions={listSessions(db, event.id)}
        speakers={speakers}
        readOnly={Boolean(event.archivedAt)}
      />
    </div>
  );
}
