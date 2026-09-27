/**
 * Rückmeldungen der Kasse (Stripe-Webhooks). Jede Ereignis-ID wird genau einmal verarbeitet (Tabelle stripe_events).
 * Die Signaturprüfung erfolgt vorher in der API-Route.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { stripeEvents } from '@/server/db/schema';
import { markCheckoutClosed, markCheckoutPaid } from './checkout';

export type ProviderEvent = {
  id: string;
  type: string;
  object: { id: string; payment_status?: string | null; payment_intent?: string | { id: string } | null; amount_total?: number | null };
};

/** paidRegistrationId: Anmeldung, die durch dieses Ereignis bezahlt wurde (→ Rechnung + Bestätigung senden). */
export type ProviderEventResult = { result: string; eventId: number | null; duplicate: boolean; paidRegistrationId: number | null };

export function handleProviderEvent(db: Db, evt: ProviderEvent, now = new Date()): ProviderEventResult {
  const seen = db.select().from(stripeEvents).where(eq(stripeEvents.id, evt.id)).get();
  if (seen?.processedAt) return { result: seen.result ?? 'processed', eventId: null, duplicate: true, paidRegistrationId: null };
  if (!seen) db.insert(stripeEvents).values({ id: evt.id, type: evt.type, receivedAt: now.toISOString() }).run();

  const o = evt.object;
  const intent = typeof o.payment_intent === 'string' ? o.payment_intent : (o.payment_intent?.id ?? null);
  let result = 'ignored';
  let eventId: number | null = null;
  let paidRegistrationId: number | null = null;
  switch (evt.type) {
    case 'checkout.session.completed':
      if (o.payment_status === 'paid') {
        const r = markCheckoutPaid(db, { sessionId: o.id, paymentIntentId: intent, amountCents: o.amount_total ?? null }, now);
        result = `paid:${r.outcome}`;
        eventId = r.eventId;
        if (r.outcome === 'confirmed' || r.outcome === 'late') paidRegistrationId = r.registrationId;
      } else {
        result = 'awaiting_async_payment';
      }
      break;
    case 'checkout.session.async_payment_succeeded': {
      const r = markCheckoutPaid(db, { sessionId: o.id, paymentIntentId: intent, amountCents: o.amount_total ?? null }, now);
      result = `paid:${r.outcome}`;
      eventId = r.eventId;
      if (r.outcome === 'confirmed' || r.outcome === 'late') paidRegistrationId = r.registrationId;
      break;
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const r = markCheckoutClosed(db, o.id, evt.type === 'checkout.session.expired' ? 'expired' : 'failed', now);
      result = r.released ? 'released' : 'no_change';
      eventId = r.released ? r.eventId : null;
      break;
    }
  }
  db.update(stripeEvents).set({ processedAt: now.toISOString(), result }).where(eq(stripeEvents.id, evt.id)).run();
  return { result, eventId, duplicate: false, paidRegistrationId };
}
