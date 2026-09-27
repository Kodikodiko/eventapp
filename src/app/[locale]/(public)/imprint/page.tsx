import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { initLocale, type LocaleParams } from '@/i18n/page';
import { requestDb } from '@/server/db';
import { getOrganizerSettings } from '@/server/services/organizer';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale === 'en' ? 'en' : 'de', namespace: 'public' });
  return { title: t('imprint') };
}

/** Impressum/Offenlegung aus den Veranstalterdaten (Admin → Einstellungen). */
export default async function ImprintPage({ params }: LocaleParams) {
  await initLocale(params);
  const t = await getTranslations('public');
  const o = getOrganizerSettings(await requestDb());
  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-3xl font-bold">{t('imprint')}</h1>
      {o.name ? (
        <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted-foreground">{t('imprintOwner')}</dt>
          <dd className="whitespace-pre-line">
            {o.name}
            {o.address && `\n${o.address}`}
          </dd>
          {o.contactEmail && (
            <>
              <dt className="text-muted-foreground">{t('contact')}</dt>
              <dd>
                <a href={`mailto:${o.contactEmail}`} className="underline underline-offset-4">
                  {o.contactEmail}
                </a>
              </dd>
            </>
          )}
          {o.vatId && (
            <>
              <dt className="text-muted-foreground">{t('vatId')}</dt>
              <dd>{o.vatId}</dd>
            </>
          )}
        </dl>
      ) : (
        <p>{t('legalMissing')}</p>
      )}
    </article>
  );
}
