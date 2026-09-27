/**
 * Stripe-Webhook: Signatur prüfen, Ereignis genau einmal verarbeiten, danach Bestätigung/Rechnung senden bzw.
 * frei gewordene Plätze anbieten.
 * Antwortet 400 bei ungültiger Signatur, 500 bei Verarbeitungsfehlern (Stripe wiederholt dann).
 */
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { refunds } from '@/server/db/schema';
import { getDb } from '@/server/db';
import { stripeClient } from '@/server/payments/stripe';
import { fillFreeSeats } from '@/server/services/automation';
import { sendRefundMail } from '@/server/services/cancellation';
import { notifyRegistrationSafely } from '@/server/services/notifications';
import { handleProviderEvent, type ProviderEvent } from '@/server/services/payment-events';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const signature = request.headers.get('stripe-signature');
  if (!secret || !process.env.STRIPE_SECRET_KEY?.trim()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!signature) return NextResponse.json({ error: 'missing_signature' }, { status: 400 });

  const body = await request.text();
  let event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  try {
    const db = getDb();
    const object = event.data.object as unknown as ProviderEvent['object'];
    const result = handleProviderEvent(db, { id: event.id, type: event.type, object });
    // Rechnung (bezahlt) ausstellen und Bestätigung senden – Fehler dabei führen nicht zu einer Wiederholung
    if (result.paidRegistrationId != null) await notifyRegistrationSafely(db, result.paidRegistrationId);
    if (result.syncedRefundId != null) {
      const refund = db.select().from(refunds).where(eq(refunds.id, result.syncedRefundId)).get();
      if (refund) await sendRefundMail(db, refund).catch(() => false);
    }
    if (result.eventId != null && result.paidRegistrationId == null) await fillFreeSeats(db, [result.eventId]);
    return NextResponse.json({ received: true, result: result.result });
  } catch (error) {
    console.error('[stripe] Webhook-Verarbeitung fehlgeschlagen', event.type, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
