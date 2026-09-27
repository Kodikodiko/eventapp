/** Stripe Checkout. Preis kommt ausschließlich vom Server; Bestätigung erst über den Webhook. */
import Stripe from 'stripe';
import type { PaymentProvider } from './provider';

let client: Stripe | null = null;

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY fehlt');
  client ??= new Stripe(key);
  return client;
}

export function stripeProvider(): PaymentProvider {
  const stripe = stripeClient();
  return {
    name: 'stripe',
    async createCheckout(req) {
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: [
            {
              quantity: 1,
              price_data: { currency: 'eur', unit_amount: req.amountCents, product_data: { name: req.productName } },
            },
          ],
          customer_email: req.customerEmail ?? undefined,
          client_reference_id: String(req.registrationId),
          metadata: { ref: req.ref, registrationId: String(req.registrationId) },
          payment_intent_data: { metadata: { ref: req.ref, registrationId: String(req.registrationId) } },
          locale: req.locale,
          expires_at: Math.floor(req.expiresAt.getTime() / 1000),
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
        },
        { idempotencyKey: `checkout-${req.ref}` }
      );
      if (!session.url) throw new Error('Stripe lieferte keine Checkout-URL');
      return { id: session.id, url: session.url };
    },
    async checkoutUrl(sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return session.status === 'open' ? session.url : null;
    },
  };
}
