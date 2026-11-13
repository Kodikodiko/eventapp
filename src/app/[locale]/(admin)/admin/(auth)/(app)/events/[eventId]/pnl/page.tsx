import { getTranslations } from 'next-intl/server';
import { PnlOverview } from '@/components/admin/pnl/pnl-overview';
import { PnlTable } from '@/components/admin/pnl/pnl-table';
import { PnlViewSwitch } from '@/components/admin/pnl/pnl-view-switch';
import { formatDateOnly, viennaDate } from '@/lib/dates';
import { localized } from '@/lib/localized';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { getPnl } from '@/server/services/pnl';

type Props = EventParams & { searchParams: Promise<{ view?: string | string[] }> };

/** Erfolgsrechnung je Event: Übersicht (Einstieg) und Tabelle (Details, Plan, Vergleich). */
export default async function PnlPage({ params, searchParams }: Props) {
  const locale = await initAdminPage(params);
  const { eventId } = await params;
  const view = (await searchParams).view === 'table' ? 'table' : 'overview';
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('pnl');
  const now = new Date();
  const pnl = getPnl(db, event, now);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PnlViewSwitch eventId={event.id} view={view} labels={{ group: t('viewLabel'), overview: t('viewOverview'), table: t('viewTable') }} />
        <p className="text-sm text-muted-foreground">{t('asOf', { date: formatDateOnly(viennaDate(now.toISOString()), locale) })}</p>
      </div>
      <h2 className="hidden text-xl font-bold print:block">
        {t('title')} · {localized(event.name, locale)}
      </h2>
      {view === 'overview' ? (
        <PnlOverview eventId={event.id} eventName={localized(event.name, locale)} pnl={pnl} locale={locale} />
      ) : (
        <PnlTable eventId={event.id} pnl={pnl} readOnly={Boolean(event.archivedAt)} />
      )}
    </div>
  );
}
