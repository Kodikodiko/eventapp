import { getFormatter, getTranslations } from 'next-intl/server';
import { LegalDocumentForm } from '@/components/admin/legal-document-form';
import { OrganizerForm } from '@/components/admin/organizer-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { publishPrivacyAction } from '@/server/actions/settings';
import { requestDb } from '@/server/db';
import { currentPrivacyNotice, listLegalVersions } from '@/server/services/legal';
import { DEFAULT_SMALL_BUSINESS_NOTE, getOrganizerSettings } from '@/server/services/organizer';

export default async function SettingsPage({ params }: LocaleParams) {
  await initLocale(params);
  const t = await getTranslations('settings');
  const tTerms = await getTranslations('terms');
  const format = await getFormatter();
  const db = await requestDb();
  const org = getOrganizerSettings(db);
  const privacy = currentPrivacyNotice(db);
  const privacyVersions = listLegalVersions(db, 'privacy', null);
  const note = org.smallBusinessNote ?? DEFAULT_SMALL_BUSINESS_NOTE;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('organizerTitle')}</CardTitle>
          <CardDescription>{t('organizerHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizerForm
            defaultValues={{
              name: org.name,
              address: org.address,
              vatId: org.vatId ?? '',
              iban: org.iban ?? '',
              bic: org.bic ?? '',
              contactEmail: org.contactEmail ?? '',
              vatMode: org.vatMode,
              smallBusinessNote: { de: note.de, en: note.en ?? '' },
              invoicePaymentTermDays: String(org.invoicePaymentTermDays),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('privacyTitle')}</CardTitle>
          <CardDescription>
            {privacy
              ? tTerms('current', { version: privacy.version, date: format.dateTime(new Date(privacy.validFrom), { dateStyle: 'medium', timeStyle: 'short' }) })
              : t('privacyNone')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('privacyHint')}</p>
          <LegalDocumentForm
            key={privacy?.id ?? 'none'}
            defaultValues={{ content: { de: privacy?.content.de ?? '', en: privacy?.content.en ?? '' } }}
            publish={publishPrivacyAction}
          />
          {privacyVersions.length > 1 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {privacyVersions.map((v) => (
                <li key={v.id}>
                  {tTerms('versionLine', { version: v.version, date: format.dateTime(new Date(v.validFrom), { dateStyle: 'medium', timeStyle: 'short' }) })}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
