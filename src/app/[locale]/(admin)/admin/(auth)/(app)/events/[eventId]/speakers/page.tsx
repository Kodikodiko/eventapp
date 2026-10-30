import { getTranslations } from 'next-intl/server';
import { SpeakersTable } from '@/components/admin/program/speakers-table';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listSpeakers } from '@/server/services/program';

export default async function SpeakersPage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('speakers');
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <SpeakersTable eventId={event.id} rows={listSpeakers(db, event.id)} readOnly={Boolean(event.archivedAt)} />
    </div>
  );
}
