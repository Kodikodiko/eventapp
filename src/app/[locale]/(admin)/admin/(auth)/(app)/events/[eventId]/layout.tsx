import { getTranslations } from 'next-intl/server';
import { ArchiveToggle, CopyEventDialog } from '@/components/admin/event-actions';
import { EventNav } from '@/components/admin/event-nav';
import { Badge } from '@/components/ui/badge';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { copySuggestion } from '@/lib/validation/event-values';
import { loadEvent, type EventParams } from '@/server/admin-pages';

export default async function EventLayout({ children, params }: EventParams & { children: React.ReactNode }) {
  const locale = await initLocale(params);
  const { eventId } = await params;
  const { event } = await loadEvent(eventId);
  const t = await getTranslations('eventOverview');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">{localized(event.name, locale)}</h1>
          <p className="text-sm text-muted-foreground">{event.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {event.archivedAt && <Badge variant="secondary">{t('archivedBadge')}</Badge>}
          <CopyEventDialog eventId={event.id} suggestion={copySuggestion(event)} />
          <ArchiveToggle eventId={event.id} archived={Boolean(event.archivedAt)} />
        </div>
      </div>
      {event.archivedAt && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">{t('archivedNotice')}</p>
      )}
      <EventNav eventId={event.id} />
      {children}
    </div>
  );
}
