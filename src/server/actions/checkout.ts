'use server';

/** Öffentliche Actions rund um Zahlung und Wartelisten-Angebot. Referenzen/Token sind zufällig und nicht erratbar. */
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { fail, ok, ServiceError, type ActionResult } from '@/lib/action-result';
import { getDb } from '@/server/db';
import { payments } from '@/server/db/schema';
import { isOnlinePaymentEnabled, onlinePaymentMode } from '@/server/payments/config';
import { getPaymentProvider } from '@/server/payments/provider';
import { clientIp, RATE_LIMITS, takeToken } from '@/server/rate-limit';
import { fillFreeSeats } from '@/server/services/automation';
import { beginCheckout, markCheckoutClosed, markCheckoutPaid, resumeCheckout } from '@/server/services/checkout';
import { notifyRegistrationSafely } from '@/server/services/notifications';
import { acceptOffer } from '@/server/services/waitlist';

const locale = z.enum(['de', 'en']);
const token = z.string().min(10).max(100);

function toFail(error: unknown): ActionResult<never> {
  if (error instanceof ServiceError) return fail(error.code, error.fieldErrors);
  console.error('[checkout] Fehler', error instanceof Error ? error.message : error);
  return fail('UNEXPECTED');
}

async function limited(): Promise<boolean> {
  return !takeToken(`checkout:${clientIp(await headers())}`, RATE_LIMITS.checkout);
}

export async function resumeCheckoutAction(ref: unknown, lang: unknown): Promise<ActionResult<{ url: string }>> {
  const r = z.string().uuid().safeParse(ref);
  const l = locale.safeParse(lang);
  if (!r.success || !l.success) return fail('INVALID');
  if (await limited()) return fail('CONFLICT', { _form: 'tooManyRequests' });
  try {
    const provider = await getPaymentProvider();
    if (!provider) return fail('CONFLICT', { _form: 'onlinePaymentUnavailable' });
    return ok({ url: await resumeCheckout(getDb(), provider, r.data, l.data) });
  } catch (error) {
    return toFail(error);
  }
}

export async function acceptOfferAction(t: unknown, lang: unknown): Promise<ActionResult<{ status: 'confirmed' | 'reserved'; checkoutUrl: string | null }>> {
  const tk = token.safeParse(t);
  const l = locale.safeParse(lang);
  if (!tk.success || !l.success) return fail('INVALID');
  if (await limited()) return fail('CONFLICT', { _form: 'tooManyRequests' });
  const db = getDb();
  try {
    const result = acceptOffer(db, tk.data, { onlinePaymentEnabled: isOnlinePaymentEnabled() });
    if (result.status !== 'reserved') {
      await notifyRegistrationSafely(db, result.registrationId);
      return ok({ status: result.status, checkoutUrl: null });
    }
    const provider = await getPaymentProvider();
    if (!provider) return fail('CONFLICT', { _form: 'onlinePaymentUnavailable' });
    const { url } = await beginCheckout(db, provider, result.registrationId, { locale: l.data });
    return ok({ status: result.status, checkoutUrl: url });
  } catch (error) {
    return toFail(error);
  }
}

/** Nur im Testmodus (PAYMENT_PROVIDER=fake): Ausgang der simulierten Zahlung festlegen. */
export async function fakePaymentAction(sessionId: unknown, outcome: unknown): Promise<ActionResult<{ ref: string | null }>> {
  if (onlinePaymentMode() !== 'fake') return fail('FORBIDDEN');
  const s = z.string().startsWith('fake_cs_').max(100).safeParse(sessionId);
  const o = z.enum(['paid', 'failed', 'expired']).safeParse(outcome);
  if (!s.success || !o.success) return fail('INVALID');
  const db = getDb();
  try {
    if (o.data === 'paid') {
      const r = markCheckoutPaid(db, { sessionId: s.data, paymentIntentId: `fake_pi_${s.data.slice(8, 20)}`, amountCents: null });
      if ((r.outcome === 'confirmed' || r.outcome === 'late') && r.registrationId != null) await notifyRegistrationSafely(db, r.registrationId);
    } else {
      const r = markCheckoutClosed(db, s.data, o.data);
      if (r.released) await fillFreeSeats(db, [r.eventId]);
    }
    const payment = db.select({ ref: payments.publicRef }).from(payments).where(eq(payments.stripeCheckoutSessionId, s.data)).get();
    return ok({ ref: payment?.ref ?? null });
  } catch (error) {
    return toFail(error);
  }
}

