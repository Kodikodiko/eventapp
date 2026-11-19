/**
 * Abgleich beim Rücksprung von Stripe: Kommt die Teilnehmerin mit ?result=success zurück und ist die Zahlung bei
 * uns noch offen, fragen wir die Kassensitzung direkt bei Stripe ab. Ist sie bezahlt, wird die Anmeldung sofort
 * bestätigt – auch wenn der Webhook (noch) nicht angekommen ist. Webhook und Abgleich laufen über dieselbe
 * Funktion markCheckoutPaid; was zuerst kommt, gewinnt, das andere ist ein Duplikat (keine doppelte Mail).
 */
import type { Db } from '@/server/db/core';
import { onlinePaymentMode } from '@/server/payments/config';
import { markCheckoutPaid } from './checkout';
import { notifyRegistrationSafely } from './notifications';

export async function syncPaidCheckout(db: Db, sessionId: string): Promise<boolean> {
  if (onlinePaymentMode() !== 'stripe' || !sessionId.startsWith('cs_')) return false;
  try {
    const { stripeClient } = await import('@/server/payments/stripe');
    const session = await stripeClient().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') return false;
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : (session.payment_intent?.id ?? null);
    const r = markCheckoutPaid(db, { sessionId, paymentIntentId: intent, amountCents: session.amount_total ?? null });
    if ((r.outcome === 'confirmed' || r.outcome === 'late') && r.registrationId != null) await notifyRegistrationSafely(db, r.registrationId);
    return r.outcome !== 'unknown';
  } catch (error) {
    console.error('[stripe] Abgleich der Kassensitzung fehlgeschlagen', sessionId, error instanceof Error ? error.message : error);
    return false;
  }
}
