/**
 * Online-Zahlung: Stripe, wenn STRIPE_SECRET_KEY gesetzt ist. Für die Entwicklung ohne Stripe-Konto gibt es
 * mit PAYMENT_PROVIDER=fake eine simulierte Kasse (niemals in Produktion setzen – die Seite ist deutlich als
 * Testmodus gekennzeichnet). Ohne beides wird Online-Zahlung öffentlich nicht angeboten.
 */
export type OnlinePaymentMode = 'stripe' | 'fake';

export function onlinePaymentMode(): OnlinePaymentMode | null {
  if (process.env.STRIPE_SECRET_KEY?.trim()) return 'stripe';
  if (process.env.PAYMENT_PROVIDER?.trim() === 'fake') return 'fake';
  return null;
}

export function isOnlinePaymentEnabled(): boolean {
  return onlinePaymentMode() !== null;
}

/** Öffentliche Basis-URL der App (für Links in Zahlungsseiten und E-Mails), ohne Schrägstrich am Ende. */
export function appBaseUrl(): string {
  return (process.env.APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}
