import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LegalText } from '@/components/public/legal-text';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { currentPrivacyNotice } from '@/server/services/legal';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale === 'en' ? 'en' : 'de', namespace: 'public' });
  return { title: t('privacy') };
}

export default async function PrivacyPage({ params }: LocaleParams) {
  const locale = await initLocale(params);
  const t = await getTranslations('public');
  const format = await getFormatter();
  const doc = currentPrivacyNotice(await requestDb());
  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">{t('privacy')}</h1>
      {doc ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t('versionInfo', { version: doc.version, date: format.dateTime(new Date(doc.validFrom), { dateStyle: 'long' }) })}
          </p>
          <LegalText text={localized(doc.content, locale)} />
        </>
      ) : (
        <p>{t('legalMissing')}</p>
      )}
    </article>
  );
}
