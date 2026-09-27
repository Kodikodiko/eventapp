import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { FakeCheckoutButtons } from '@/components/public/checkout-actions';
import { initLocale } from '@/i18n/page';
import { localized } from '@/lib/localized';
import { formatEuro } from '@/lib/money';
import { requestDb } from '@/server/db';
import { payments } from '@/server/db/schema';
import { onlinePaymentMode } from '@/server/payments/config';
import { getCheckoutView } from '@/server/services/checkout';

type Props = { params: Promise<{ locale: string; sessionId: string }> };

export const metadata: Metadata = { robots: { index: false } };

/** Simulierte Kasse – nur mit PAYMENT_PROVIDER=fake erreichbar. */
export default async function FakeCheckoutPage({ params }: Props) {
  const locale = await initLocale(params);
  const { sessionId } = await params;
  if (onlinePaymentMode() !== 'fake' || !sessionId.startsWith('fake_cs_')) notFound();
  const db = await requestDb();
  const payment = db.select().from(payments).where(eq(payments.stripeCheckoutSessionId, sessionId)).get();
  const view = payment?.publicRef ? getCheckoutView(db, payment.publicRef) : undefined;
  if (!payment || !view) notFound();
  const t = await getTranslations('fakeCheckout');
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="rounded-md border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-sm font-medium text-amber-900">{t('banner')}</p>
      <div className="space-y-4 rounded-lg border p-6">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p>
          {localized(view.eventName, locale)} · <span className="font-semibold">{formatEuro(view.amountCents, locale)}</span>
        </p>
        {payment.status === 'pending' ? (
          <FakeCheckoutButtons sessionId={sessionId} cancelHref={`/checkout/${view.ref}?result=cancelled`} />
        ) : (
          <p>{t('done', { status: payment.status })}</p>
        )}
      </div>
    </div>
  );
}
