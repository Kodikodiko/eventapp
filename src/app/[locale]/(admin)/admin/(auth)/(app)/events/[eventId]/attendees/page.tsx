import { AttendeesTable } from '@/components/admin/attendees/attendees-table';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { centsToInput } from '@/lib/money';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { getEventStats } from '@/server/services/events';
import { listRegistrations, listRoles } from '@/server/services/registrations';

type Props = EventParams & { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AttendeesPage({ params, searchParams }: Props) {
  const locale = await initLocale(params);
  const { eventId } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '';
  const { db, event } = await loadEvent(eventId);
  const rows = listRegistrations(db, event.id);
  const roles = listRoles(db).map((r) => ({ key: r.key, label: localized(r.label, locale) }));
  const stats = getEventStats(db, event);
  const openId = Number(one('r'));

  return (
    <AttendeesTable
      eventId={event.id}
      rows={rows}
      roles={roles}
      seatsFree={stats.seatsFree}
      readOnly={Boolean(event.archivedAt)}
      prices={{ normal: centsToInput(event.priceNormalCents), member: centsToInput(event.priceMemberCents) }}
      initialView={one('view') || undefined}
      openId={Number.isSafeInteger(openId) && rows.some((r) => r.id === openId) ? openId : null}
      openCreate={one('new') === '1'}
      intentKey={[one('r'), one('new'), one('view'), one('n')].join('|')}
    />
  );
}
