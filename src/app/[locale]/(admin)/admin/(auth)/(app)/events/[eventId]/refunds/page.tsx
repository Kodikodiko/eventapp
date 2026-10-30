import { getTranslations } from 'next-intl/server';
import { RefundsView } from '@/components/admin/refunds/refunds-view';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { listRefunds } from '@/server/services/refunds';
import { listRegistrations } from '@/server/services/registrations';

export default async function RefundsPage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('refunds');
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <RefundsView
        rows={listRefunds(db, event.id)}
        refundMode={event.refundMode}
        readOnly={Boolean(event.archivedAt)}
        // Auswahl für „Neue Erstattung“: kostenpflichtige oder schon bezahlte Anmeldungen
        candidates={listRegistrations(db, event.id)
          .filter((r) => r.refundableCents > 0 || (r.status !== 'cancelled' && r.priceCents > 0))
          .map(({ id, firstName, lastName, email, status, paymentStatus, priceCents, refundableCents, invoiceNumber }) => ({
            id, firstName, lastName, email, status, paymentStatus, priceCents, refundableCents, invoiceNumber,
          }))}
      />
    </div>
  );
}
