import { getTranslations } from 'next-intl/server';
import { ExpensesView } from '@/components/admin/expenses/expenses-view';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { eventTotals, listEventGroups, listExpenses } from '@/server/services/expenses';
import { getOrganizerSettings } from '@/server/services/organizer';
import { listSpeakers } from '@/server/services/program';

export default async function ExpensesPage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('expenses');
  const groups = listEventGroups(db, event.id);
  return (
    <div className="space-y-4">
      <h2 className="sr-only">{t('title')}</h2>
      <ExpensesView
        eventId={event.id}
        groups={groups}
        totals={eventTotals(groups)}
        expenses={listExpenses(db, event.id)}
        speakers={listSpeakers(db, event.id).map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))}
        withVat={getOrganizerSettings(db).vatMode === 'standard'}
        readOnly={Boolean(event.archivedAt)}
      />
    </div>
  );
}
