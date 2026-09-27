import { getTranslations } from 'next-intl/server';
import { AttendeesTable } from '@/components/admin/attendees/attendees-table';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { centsToInput } from '@/lib/money';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { getEventStats } from '@/server/services/events';
import { listRegistrations, listRoles } from '@/server/services/registrations';

export default async function AttendeesPage({ params }: EventParams) {
  const locale = await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('attendees');
  const rows = listRegistrations(db, event.id);
  const roles = listRoles(db).map((r) => ({ key: r.key, label: localized(r.label, locale) }));
  const stats = getEventStats(db, event);

  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <AttendeesTable
        eventId={event.id}
        rows={rows}
        roles={roles}
        seatsFree={stats.seatsFree}
        readOnly={Boolean(event.archivedAt)}
        prices={{ normal: centsToInput(event.priceNormalCents), member: centsToInput(event.priceMemberCents) }}
      />
    </div>
  );
}
