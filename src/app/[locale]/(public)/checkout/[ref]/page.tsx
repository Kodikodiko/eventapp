import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AutoRefresh, ResumeCheckoutButton } from '@/components/public/checkout-actions';
import { CheckoutPaid } from '@/components/public/checkout-paid';
import { Link } from '@/i18n/navigation';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { requestDb } from '@/server/db';
import { getCheckoutView } from '@/server/services/checkout';
import { syncPaidCheckout } from '@/server/services/checkout-sync';
import { getOrganizerSettings } from '@/server/services/organizer';
import { listPublicSessions } from '@/server/services/public-events';

type Props = { params: Promise<{ locale: string; ref: string }>; searchParams: Promise<{ result?: string }> };

export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CheckoutPage({ params, searchParams }: Props) {
  const locale = await initLocale(params);
  const { ref } = await params;
  if (!UUID.test(ref)) notFound();
  const db = await requestDb();
  let view = getCheckoutView(db, ref);
  if (!view) notFound();
  const { result } = await searchParams;
  // Rücksprung von Stripe, Zahlung noch offen: direkt bei Stripe nachfragen statt nur auf den Webhook zu warten
  if (result === 'success' && view.paymentStatus === 'pending' && view.sessionId && (await syncPaidCheckout(db, view.sessionId))) {
    view = getCheckoutView(db, ref) ?? view;
  }
  const t = await getTranslations('checkout');
  const format = await getFormatter();
  const event = localized(view.eventName, locale);
  const now = new Date().toISOString();

  const paid = view.paymentStatus === 'succeeded';
  const open = view.paymentStatus === 'pending' && view.registrationStatus === 'reserved' && !!view.reservedUntil && view.reservedUntil > now;
  const state = paid ? 'paid' : open ? (result === 'success' ? 'processing' : 'open') : 'closed';

  // Bezahlt: eigene Bestätigungsseite (Entwurf B)
  if (state === 'paid') {
    const hasProgram = listPublicSessions(db, view.eventId).length > 0;
    return <CheckoutPaid view={view} locale={locale} hasProgram={hasProgram} contactEmail={getOrganizerSettings(db).contactEmail} />;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-lg border p-6" role="status">
      <h1 className="text-2xl font-semibold">{t(`${state}.title`)}</h1>
      <p>{t(`${state}.text`, { event })}</p>
      <p className="text-sm text-muted-foreground">
        {event} · {formatEuro(view.amountCents, locale)}
      </p>
      {state === 'open' && view.reservedUntil && (
        <>
          <p className="text-sm">{t('reservedUntil', { time: format.dateTime(new Date(view.reservedUntil), { timeStyle: 'short' }) })}</p>
          <ResumeCheckoutButton reference={ref} />
        </>
      )}
      {state === 'processing' && <AutoRefresh />}
      {state === 'closed' && (
        <Link href={`/events/${view.eventSlug}/register`} className="inline-block underline underline-offset-4">
          {t('registerAgain')}
        </Link>
      )}
      <p>
        <Link href={`/events/${view.eventSlug}`} className="text-sm underline underline-offset-4">
          {t('backToEvent')}
        </Link>
      </p>
    </div>
  );
}
