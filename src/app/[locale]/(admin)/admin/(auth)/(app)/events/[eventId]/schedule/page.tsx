import { getTranslations } from 'next-intl/server';
import { ProgramPlanner } from '@/components/admin/program/program-planner';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listSessions, listSpeakers, listStreams } from '@/server/services/program';

export default async function SchedulePage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('schedule');
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <ProgramPlanner
        eventId={event.id}
        eventStartsAt={event.startsAt}
        sessions={listSessions(db, event.id)}
        speakers={listSpeakers(db, event.id)}
        streams={listStreams(db, event.id)}
        readOnly={Boolean(event.archivedAt)}
      />
    </div>
  );
}
