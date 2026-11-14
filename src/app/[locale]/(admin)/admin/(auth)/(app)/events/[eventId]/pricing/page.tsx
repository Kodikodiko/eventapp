import { getTranslations } from 'next-intl/server';
import { PricingView } from '@/components/admin/pricing/pricing-view';
import { earlyBirdWindowOpen } from '@/lib/pricing';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listDiscountCodes, listPriceCategories } from '@/server/services/pricing';

export default async function PricingPage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('pricing');
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <PricingView
        eventId={event.id}
        earlyBird={{
          startsAt: event.earlyBirdStartsAt,
          endsAt: event.earlyBirdEndsAt,
          normalCents: event.priceEarlyNormalCents,
          memberCents: event.priceEarlyMemberCents,
          priceNormalCents: event.priceNormalCents,
          priceMemberCents: event.priceMemberCents,
          active: earlyBirdWindowOpen(event, new Date()),
        }}
        categories={listPriceCategories(db, event.id)}
        codes={listDiscountCodes(db, event.id)}
        readOnly={Boolean(event.archivedAt)}
      />
    </div>
  );
}
