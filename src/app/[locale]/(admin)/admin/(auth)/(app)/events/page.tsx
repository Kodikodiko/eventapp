import { Plus } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { getEventStats, listEvents, registrationState } from '@/server/services/events';

type Props = LocaleParams & { searchParams: Promise<{ archived?: string }> };

export default async function EventsPage({ params, searchParams }: Props) {
  const locale = await initLocale(params);
  const showArchived = (await searchParams).archived === '1';
  const t = await getTranslations('events');
  const tState = await getTranslations('registrationState');
  const format = await getFormatter();
  const db = await requestDb();
  const rows = listEvents(db, { includeArchived: showArchived }).map((event) => ({
    event,
    stats: getEventStats(db, event),
    state: registrationState(event),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <div className="flex items-center gap-3">
          <Link href={showArchived ? '/admin/events' : '/admin/events?archived=1'} className="text-sm text-primary underline">
            {showArchived ? t('hideArchived') : t('showArchived')}
          </Link>
          <Button asChild size="sm">
            <Link href="/admin/events/new">
              <Plus aria-hidden className="size-4" />
              {t('new')}
            </Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-medium">{t('colName')}</th>
                <th className="p-3 font-medium">{t('colDate')}</th>
                <th className="p-3 font-medium">{t('colLocation')}</th>
                <th className="p-3 text-right font-medium">{t('colSeats')}</th>
                <th className="p-3 text-right font-medium">{t('colWaitlist')}</th>
                <th className="p-3 font-medium">{t('colRegistration')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, stats, state }) => (
                <tr key={event.id} className="border-t">
                  <td className="p-3">
                    <Link href={`/admin/events/${event.id}`} className="font-medium text-primary hover:underline">
                      {localized(event.name, locale)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{event.slug}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{format.dateTime(new Date(event.startsAt), { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="p-3">{event.location}</td>
                  <td className="p-3 text-right tabular-nums">
                    {stats.seatsTaken} / {event.capacity}
                  </td>
                  <td className="p-3 text-right tabular-nums">{stats.waitlisted}</td>
                  <td className="p-3">
                    <Badge variant={state === 'open' ? 'default' : 'secondary'}>{tState(state)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
