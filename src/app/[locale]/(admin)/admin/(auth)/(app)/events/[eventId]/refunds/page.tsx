import { getTranslations } from 'next-intl/server';
import { RefundsView } from '@/components/admin/refunds/refunds-view';
import { initLocale } from '@/i18n/page';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { listRefunds } from '@/server/services/refunds';

export default async function RefundsPage({ params }: EventParams) {
  await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('refunds');
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <RefundsView rows={listRefunds(db, event.id)} refundMode={event.refundMode} />
    </div>
  );
}
