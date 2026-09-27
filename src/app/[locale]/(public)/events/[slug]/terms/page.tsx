import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LegalText } from '@/components/public/legal-text';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { currentTerms } from '@/server/services/legal';
import { getPublicEventBySlug } from '@/server/services/public-events';

type Props = { params: Promise<{ locale: string; slug: string }> };

export default async function TermsPage({ params }: Props) {
  const locale = await initLocale(params);
  const { slug } = await params;
  const db = await requestDb();
  const event = getPublicEventBySlug(db, slug);
  if (!event) notFound();
  const t = await getTranslations('public');
  const format = await getFormatter();
  const doc = currentTerms(db, event.id);
  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <Link href={`/events/${event.slug}`} className="text-sm text-muted-foreground hover:underline">
        ← {localized(event.name, locale)}
      </Link>
      <h1 className="text-3xl font-bold">{t('termsTitle')}</h1>
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
