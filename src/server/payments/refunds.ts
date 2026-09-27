/**
 * Erstattung einer Online-Zahlung bei der Kasse. Zahlungen der simulierten Kasse (fake_pi_…) werden simuliert
 * erstattet, alle anderen über Stripe (dafür muss STRIPE_SECRET_KEY gesetzt sein).
 */
import { randomUUID } from 'node:crypto';

export type RefundRequest = { paymentIntentId: string; amountCents: number; refundId: number };
export type RefundResult = { id: string; status: 'succeeded' | 'pending' | 'failed'; failureReason?: string | null };
export type Refunder = (req: RefundRequest) => Promise<RefundResult>;

export const fakeRefunder: Refunder = async () => ({ id: `fake_re_${randomUUID()}`, status: 'succeeded' });

export const stripeRefunder: Refunder = async (req) => {
  const { stripeClient } = await import('./stripe');
  const refund = await stripeClient().refunds.create(
    { payment_intent: req.paymentIntentId, amount: req.amountCents, metadata: { refundId: String(req.refundId) } },
    // gleiche Erstattung wird bei Wiederholung nie doppelt ausgeführt
    { idempotencyKey: `refund-${req.refundId}-${req.amountCents}` }
  );
  const status = refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending';
  return { id: refund.id, status, failureReason: refund.failure_reason ?? null };
};

export function refunderFor(paymentIntentId: string): Refunder {
  return paymentIntentId.startsWith('fake_') ? fakeRefunder : stripeRefunder;
}
