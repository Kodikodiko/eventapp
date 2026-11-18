import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import type { EventRow } from '@/server/services/events';
import { listPastPublicEvents, listPublicEvents } from '@/server/services/public-events';

export default async function HomePage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations('public');
  const format = await getFormatter();
  const db = await requestDb();
  const list = listPublicEvents(db);
  const past = listPastPublicEvents(db);

  const card = (e: EventRow, linkLabel: string) => (
    <Card key={e.id} className="flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl">
          <Link href={`/events/${e.slug}`} className="hover:underline">
            {localized(e.name, locale)}
          </Link>
        </CardTitle>
        <CardDescription>
          {format.dateTimeRange(new Date(e.startsAt), new Date(e.endsAt), { dateStyle: 'long', timeStyle: 'short' })}
          {e.location && ` · ${e.location}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-auto">
        <Link href={`/events/${e.slug}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('upcomingTitle')}</h1>
        <p className="mt-1 text-muted-foreground">{t('upcomingIntro')}</p>
      </div>
      {list.length === 0 && <p className="rounded-lg border p-6 text-center text-muted-foreground">{t('noEvents')}</p>}
      <div className="grid gap-4 md:grid-cols-2">{list.map((e) => card(e, t('details')))}</div>
      {past.length > 0 && (
        <section aria-labelledby="past-events" className="space-y-4 pt-6">
          <h2 id="past-events" className="text-2xl font-semibold">
            {t('pastTitle')}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">{past.map((e) => card(e, t('pastDetails')))}</div>
        </section>
      )}
    </div>
  );
}
