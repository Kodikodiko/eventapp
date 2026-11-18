import { getTranslations } from 'next-intl/server';
import { InvoicesView, type InvoiceStateFilter } from '@/components/admin/invoices/invoices-view';
import { InvoicesViewAlt } from '@/components/admin/invoices/invoices-view-alt';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { mailTransport } from '@/server/mail';
import { listInvoices } from '@/server/services/invoices';
import { getOrganizerSettings } from '@/server/services/organizer';
import { getUiVersion } from '@/server/ui-version';

type Props = EventParams & { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InvoicesPage({ params, searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? '';
  const requested = one('state');
  const alt = (await getUiVersion()) === 'alt';
  // neue Liste: ohne Angabe selbst entscheiden (Handlungsbedarf zuerst); alte Liste: „Alle“
  const state: InvoiceStateFilter | undefined = requested === 'overdue' || requested === 'open' || requested === 'paid' || requested === 'all' ? requested : alt ? 'all' : undefined;
  const View = alt ? InvoicesViewAlt : InvoicesView;
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('invoices');
  const org = getOrganizerSettings(db);
  const organizerIncomplete = !org.name.trim() || !org.address.trim() || ((event.vatMode ?? org.vatMode) === 'standard' && !org.vatId?.trim());
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <View
        rows={listInvoices(db, event.id)} organizerIncomplete={organizerIncomplete} mailToFile={mailTransport() === 'file'}
        initialQuery={one('q').slice(0, 100)}
        initialState={state}
      />
    </div>
  );
}
