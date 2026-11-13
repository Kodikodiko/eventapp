import { getFormatter, getTranslations } from 'next-intl/server';
import { EventForm } from '@/components/admin/event-form';
import { EventTermsEditor } from '@/components/admin/event-terms-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { eventToFormValues } from '@/lib/validation/event-values';
import { initAdminPage, loadEvent, type EventParams } from '@/server/admin-pages';
import { publishTermsAction } from '@/server/actions/events';
import { getCancellationRules } from '@/server/services/events';
import { latestGlobalTerms, listLegalVersions } from '@/server/services/legal';
import { getOrganizerSettings } from '@/server/services/organizer';

export default async function EventSettingsPage({ params }: EventParams) {
  await initAdminPage(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const rules = getCancellationRules(db, event.id);
  const t = await getTranslations('terms');
  const format = await getFormatter();
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const versions = listLegalVersions(db, 'terms', event.id);
  const current = versions.find((v) => v.id === event.termsDocumentId) ?? versions[0];
  const global = latestGlobalTerms(db);
  const pair = (c: { de: string; en?: string } | undefined) => ({ content: { de: c?.de ?? '', en: c?.en ?? '' } });
  const archived = Boolean(event.archivedAt);

  return (
    <div className="space-y-6">
      <EventForm
        key={`${event.id}-${event.slug}`}
        mode="edit"
        eventId={event.id}
        defaultValues={eventToFormValues(event, rules)}
        readOnly={archived}
        globalVatMode={getOrganizerSettings(db).vatMode}
      />

      <Card id="terms" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{current ? t('current', { version: current.version, date: when(current.validFrom) }) : t('none')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('eventHint')}</p>
          <EventTermsEditor
            key={current?.id ?? 'none'}
            current={pair(current?.content)}
            global={global ? pair(global.content) : null}
            publish={publishTermsAction.bind(null, event.id)}
            disabled={archived}
          />
          {versions.length > 0 && (
            <div className="space-y-1 pt-2">
              <p className="text-sm font-medium">{t('versions')}</p>
              <p className="text-xs text-muted-foreground">{t('versionsHint')}</p>
              <ul className="space-y-1 text-sm">
                {versions.map((v) => (
                  <li key={v.id}>
                    {t('versionLine', { version: v.version, date: when(v.validFrom) })}
                    {v.id === current?.id && <span className="ml-2 text-muted-foreground">({t('active')})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
