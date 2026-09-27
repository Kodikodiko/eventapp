import { getTranslations } from 'next-intl/server';
import { SponsorsView } from '@/components/admin/sponsors/sponsors-view';
import { initLocale } from '@/i18n/page';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { listPackages, listSponsors, sponsorTotals } from '@/server/services/sponsors';

export default async function SponsorsPage({ params }: EventParams) {
  await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('sponsors');
  const sponsors = listSponsors(db, event.id);
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <SponsorsView
        eventId={event.id}
        packages={listPackages(db, event.id)}
        sponsors={sponsors}
        totals={sponsorTotals(sponsors)}
        readOnly={Boolean(event.archivedAt)}
      />
    </div>
  );
}
