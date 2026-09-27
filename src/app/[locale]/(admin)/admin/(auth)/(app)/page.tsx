import { getFormatter, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { getEventStats, listEvents } from '@/server/services/events';

export default async function AdminDashboardPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations('dashboard');
  const format = await getFormatter();
  const db = await requestDb();
  const now = new Date().toISOString();
  const upcoming = listEvents(db)
    .filter((e) => e.endsAt >= now)
    .map((event) => ({ event, stats: getEventStats(db, event) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('upcoming')}</h2>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">
            {t('noUpcoming')}{' '}
            <Link href="/admin/events/new" className="text-primary underline">
              {t('createFirst')}
            </Link>
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map(({ event, stats }) => (
              <li key={event.id} className="rounded-lg border p-4">
                <Link href={`/admin/events/${event.id}`} className="font-medium text-primary hover:underline">
                  {localized(event.name, locale)}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {format.dateTime(new Date(event.startsAt), { dateStyle: 'medium' })} · {event.location}
                </p>
                <p className="mt-2 text-sm">
                  {t('seats', { taken: stats.seatsTaken, capacity: event.capacity })}
                  {stats.waitlisted > 0 && ` · ${t('waitlisted', { count: stats.waitlisted })}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
