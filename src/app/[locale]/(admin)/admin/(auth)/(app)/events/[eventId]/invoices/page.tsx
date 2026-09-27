import { getTranslations } from 'next-intl/server';
import { InvoicesView } from '@/components/admin/invoices/invoices-view';
import { initLocale } from '@/i18n/page';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { mailTransport } from '@/server/mail';
import { listInvoices } from '@/server/services/invoices';
import { getOrganizerSettings } from '@/server/services/organizer';

export default async function InvoicesPage({ params }: EventParams) {
  await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('invoices');
  const org = getOrganizerSettings(db);
  const organizerIncomplete = !org.name.trim() || !org.address.trim() || (org.vatMode === 'standard' && !org.vatId?.trim());
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <InvoicesView rows={listInvoices(db, event.id)} organizerIncomplete={organizerIncomplete} mailToFile={mailTransport() === 'file'} />
    </div>
  );
}
