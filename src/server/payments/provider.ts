/** Schnittstelle zur Kasse (Stripe Checkout oder simulierte Kasse für die Entwicklung). */
import { onlinePaymentMode } from './config';

export type CheckoutRequest = {
  /** eigene Referenz (payments.public_ref), landet in den Metadaten */
  ref: string;
  registrationId: number;
  amountCents: number;
  productName: string;
  customerEmail: string | null;
  locale: 'de' | 'en';
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = { id: string; url: string };

export interface PaymentProvider {
  readonly name: 'stripe' | 'fake';
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** URL einer noch offenen Kassensitzung (zum Fortsetzen nach Abbruch), null wenn nicht mehr offen */
  checkoutUrl(sessionId: string, locale: 'de' | 'en'): Promise<string | null>;
}

export async function getPaymentProvider(): Promise<PaymentProvider | null> {
  const mode = onlinePaymentMode();
  if (mode === 'stripe') return (await import('./stripe')).stripeProvider();
  if (mode === 'fake') return (await import('./fake')).fakeProvider;
  return null;
}
