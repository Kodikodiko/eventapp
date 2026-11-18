import { getTranslations } from 'next-intl/server';
import { CheckInView } from '@/components/admin/checkin/checkin-view';
import { localized } from '@/lib/localized';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listCheckIn } from '@/server/services/checkin';
import { listRoles } from '@/server/services/registrations';

/** Check-in am Eventtag (neu mit dem UI-Redesign, TODO UI4). */
export default async function CheckInPage({ params }: EventParams) {
  const locale = await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('checkin');
  const roleLabels = Object.fromEntries(listRoles(db).map((r) => [r.key, localized(r.label, locale)]));
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <CheckInView eventId={event.id} rows={listCheckIn(db, event.id)} roleLabels={roleLabels} readOnly={Boolean(event.archivedAt)} />
    </div>
  );
}
