import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AcceptOfferButton } from '@/components/public/checkout-actions';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { requestDb } from '@/server/db';
import { isOnlinePaymentEnabled } from '@/server/payments/config';
import { getOfferView } from '@/server/services/waitlist';

type Props = { params: Promise<{ locale: string; token: string }> };

export const metadata: Metadata = { robots: { index: false } };

/** Wartelisten-Angebot (Link aus der E-Mail). */
export default async function OfferPage({ params }: Props) {
  const locale = await initLocale(params);
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) notFound();
  const view = getOfferView(await requestDb(), token);
  if (!view) notFound();
  const t = await getTranslations('offer');
  const format = await getFormatter();
  const event = localized(view.eventName, locale);
  const price = view.priceCents === 0 ? t('free') : formatEuro(view.priceCents, locale);
  const needsOnline = view.paymentMethod === 'stripe';
  const unavailable = needsOnline && !isOnlinePaymentEnabled();

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-lg border p-6">
      <h1 className="text-2xl font-semibold">{t(`${view.state}.title`)}</h1>
      <p className="text-muted-foreground">
        {event} · {format.dateTimeRange(new Date(view.startsAt), new Date(view.endsAt), { dateStyle: 'long', timeStyle: 'short' })}
      </p>
      <p>{t(`${view.state}.text`, { event })}</p>
      {view.state === 'open' && (
        <>
          <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">{t('price')}</dt>
            <dd>{price}</dd>
            <dt className="text-muted-foreground">{t('payment')}</dt>
            <dd>{t(`method.${view.paymentMethod}`)}</dd>
            <dt className="text-muted-foreground">{t('validUntil')}</dt>
            <dd>{format.dateTime(new Date(view.expiresAt), { dateStyle: 'long', timeStyle: 'short' })}</dd>
          </dl>
          {unavailable ? <p className="text-sm">{t('onlineUnavailable')}</p> : <AcceptOfferButton token={token} label={needsOnline ? t('acceptAndPay') : t('accept')} />}
        </>
      )}
      <Link href={`/events/${view.eventSlug}`} className="inline-block text-sm underline underline-offset-4">
        {t('backToEvent')}
      </Link>
    </div>
  );
}
