import { getFormatter, getTranslations } from 'next-intl/server';
import { LegalDocumentForm } from '@/components/admin/legal-document-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { initLocale } from '@/i18n/page';
import { loadEvent, type EventParams } from '@/server/admin-pages';
import { publishTermsAction } from '@/server/actions/events';
import { listLegalVersions } from '@/server/services/legal';

export default async function EventTermsPage({ params }: EventParams) {
  await initLocale(params);
  const { eventId } = await params;
  const { db, event } = await loadEvent(eventId);
  const t = await getTranslations('terms');
  const format = await getFormatter();
  const versions = listLegalVersions(db, 'terms', event.id);
  const current = versions.find((v) => v.id === event.termsDocumentId) ?? versions[0];
  const publish = publishTermsAction.bind(null, event.id);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>
            {current
              ? t('current', { version: current.version, date: format.dateTime(new Date(current.validFrom), { dateStyle: 'medium', timeStyle: 'short' }) })
              : t('none')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LegalDocumentForm
            key={current?.id ?? 'none'}
            defaultValues={{ content: { de: current?.content.de ?? '', en: current?.content.en ?? '' } }}
            publish={publish}
            disabled={Boolean(event.archivedAt)}
          />
        </CardContent>
      </Card>

      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('versions')}</CardTitle>
            <CardDescription>{t('versionsHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {versions.map((v) => (
                <li key={v.id}>
                  {t('versionLine', { version: v.version, date: format.dateTime(new Date(v.validFrom), { dateStyle: 'medium', timeStyle: 'short' }) })}
                  {v.id === current?.id && <span className="ml-2 text-muted-foreground">({t('active')})</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
