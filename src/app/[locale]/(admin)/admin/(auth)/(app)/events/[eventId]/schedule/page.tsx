import { getTranslations } from 'next-intl/server';
import { ProgramPlanner } from '@/components/admin/program/program-planner';
import { ScheduleView } from '@/components/admin/program/schedule-view';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listSessions, listSpeakers, listStreams } from '@/server/services/program';
import { getUiVersion } from '@/server/ui-version';

export default async function SchedulePage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('schedule');
  const speakerRows = listSpeakers(db, event.id);
  const speakers = speakerRows.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }));
  if ((await getUiVersion()) === 'neu') {
    return (
      <div className="space-y-4">
        <h2 className="sr-only">{t('title')}</h2>
        <ProgramPlanner
          eventId={event.id}
          eventStartsAt={event.startsAt}
          sessions={listSessions(db, event.id)}
          speakers={speakerRows}
          streams={listStreams(db, event.id)}
          readOnly={Boolean(event.archivedAt)}
        />
      </div>
    );
  }
  // alte Programmansicht bleibt über den Umschalter wählbar
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <ScheduleView
        eventId={event.id}
        eventStartsAt={event.startsAt}
        sessions={listSessions(db, event.id)}
        speakers={speakers}
        streams={listStreams(db, event.id)}
        readOnly={Boolean(event.archivedAt)}
      />
    </div>
  );
}
