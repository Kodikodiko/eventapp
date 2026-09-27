import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { RegistrationForm } from '@/components/public/registration-form';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { requestDb } from '@/server/db';
import { isOnlinePaymentEnabled } from '@/server/payments/config';
import { getOrganizerSettings } from '@/server/services/organizer';
import { getAvailability, getPublicEventBySlug } from '@/server/services/public-events';

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = getPublicEventBySlug(await requestDb(), slug);
  const t = await getTranslations({ locale: locale === 'en' ? 'en' : 'de', namespace: 'public' });
  return event ? { title: `${t('registration')} – ${localized(event.name, locale === 'en' ? 'en' : 'de')}` } : {};
}

export default async function RegisterPage({ params }: Props) {
  const locale = await initLocale(params);
  const { slug } = await params;
  const db = await requestDb();
  const event = getPublicEventBySlug(db, slug);
  if (!event) notFound();
  const t = await getTranslations('public');
  const format = await getFormatter();
  const availability = getAvailability(db, event, isOnlinePaymentEnabled());
  const organizer = getOrganizerSettings(db);
  const name = localized(event.name, locale);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/events/${event.slug}`} className="text-sm text-muted-foreground hover:underline">
          ← {name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{t('registerTitle')}</h1>
        <p className="text-muted-foreground">
          {name} · {format.dateTimeRange(new Date(event.startsAt), new Date(event.endsAt), { dateStyle: 'long', timeStyle: 'short' })}
        </p>
      </div>
      {availability.state === 'open' && availability.termsDocumentId && availability.privacyDocumentId ? (
        <RegistrationForm
          event={{
            id: event.id,
            slug: event.slug,
            name,
            priceNormalCents: event.priceNormalCents,
            priceMemberCents: event.priceMemberCents,
          }}
          waitlistOnly={availability.waitlistOnly}
          paymentMethods={availability.paymentMethods}
          termsDocumentId={availability.termsDocumentId}
          privacyDocumentId={availability.privacyDocumentId}
          paymentTermDays={organizer.invoicePaymentTermDays}
        />
      ) : (
        <p className="rounded-lg border p-6">{availability.state === 'notOpenYet' ? t('notOpenYet') : availability.state === 'unavailable' ? t('unavailable') : t('closed')}</p>
      )}
    </div>
  );
}
