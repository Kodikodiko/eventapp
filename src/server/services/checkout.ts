/**
 * Online-Zahlung einer Anmeldung (Spezifikation 3.1):
 * - Reservierung („reserved“) → Kassensitzung beim Anbieter; der Preis kommt aus der Anmeldung (Server).
 * - Bestätigt wird nur über die Rückmeldung des Anbieters (Webhook bzw. simulierte Kasse), nie über die Rücksprung-URL.
 * - Jede Rückmeldung ist idempotent; eine verspätete Zahlung wird trotzdem angenommen (Hinweis im Protokoll).
 * - Läuft die Sitzung ab oder schlägt die Zahlung fehl, wird die Reservierung storniert und der Platz frei.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { localized } from '@/lib/localized';
import type { Db } from '@/server/db/core';
import { events, payments, people, registrations, waitlistOffers } from '@/server/db/schema';
import { appBaseUrl } from '@/server/payments/config';
import type { PaymentProvider } from '@/server/payments/provider';
import { SYSTEM, writeAudit } from './audit';
import { getEventStats } from './events';

/** Stripe verlangt mindestens 30 Minuten Gültigkeit; eine Minute Puffer für die Anfrage. */
export const CHECKOUT_VALID_MS = 31 * 60_000;
/** Sicherheitsabstand, bevor der Zeitplan eine abgelaufene Reservierung selbst storniert (Webhook kommt meist vorher). */
export const EXPIRY_GRACE_MS = 10 * 60_000;

export type CheckoutStart = { ref: string; url: string };

export async function beginCheckout(
  db: Db,
  provider: PaymentProvider,
  registrationId: number,
  options: { locale: 'de' | 'en'; now?: Date }
): Promise<CheckoutStart> {
  const now = options.now ?? new Date();
  const row = db
    .select({ reg: registrations, event: events, email: people.email })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .innerJoin(people, eq(people.id, registrations.personId))
    .where(eq(registrations.id, registrationId))
    .get();
  if (!row) throw new ServiceError('NOT_FOUND');
  if (row.reg.status !== 'reserved' || row.reg.paymentMethod !== 'stripe' || row.reg.priceCents <= 0) throw new ServiceError('CONFLICT');

  const ref = randomUUID();
  const expiresAt = new Date(now.getTime() + CHECKOUT_VALID_MS);
  db.transaction((tx) => {
    tx.insert(payments)
      .values({ registrationId, method: 'stripe', status: 'pending', amountCents: row.reg.priceCents, publicRef: ref, createdAt: now.toISOString() })
      .run();
    tx.update(registrations).set({ reservedUntil: expiresAt.toISOString() }).where(eq(registrations.id, registrationId)).run();
  });

  const base = `${appBaseUrl()}/${options.locale}/checkout/${ref}`;
  try {
    const ticket = row.reg.ticketType === 'member' ? (options.locale === 'en' ? 'member ticket' : 'Mitgliedsticket') : options.locale === 'en' ? 'ticket' : 'Ticket';
    const session = await provider.createCheckout({
      ref,
      registrationId,
      amountCents: row.reg.priceCents,
      productName: `${localized(row.event.name, options.locale)} – ${ticket}`,
      customerEmail: row.email,
      locale: options.locale,
      expiresAt,
      successUrl: `${base}?result=success`,
      cancelUrl: `${base}?result=cancelled`,
    });
    db.update(payments).set({ stripeCheckoutSessionId: session.id }).where(eq(payments.publicRef, ref)).run();
    return { ref, url: session.url };
  } catch (error) {
    // Kasse nicht erreichbar: Reservierung sofort freigeben, damit der Platz nicht blockiert bleibt
    db.transaction((tx) => {
      tx.update(payments).set({ status: 'failed' }).where(eq(payments.publicRef, ref)).run();
      tx.update(registrations)
        .set({ status: 'cancelled', cancelledAt: now.toISOString(), cancelReason: 'Kasse nicht erreichbar', reservedUntil: null })
        .where(and(eq(registrations.id, registrationId), eq(registrations.status, 'reserved')))
        .run();
      writeAudit(tx, SYSTEM, { action: 'payment.failed', entity: 'registration', entityId: registrationId, eventId: row.event.id, summary: 'Kassensitzung konnte nicht erstellt werden' });
    });
    throw error;
  }
}

export type CheckoutView = {
  ref: string;
  eventSlug: string;
  eventName: (typeof events.$inferSelect)['name'];
  registrationStatus: (typeof registrations.$inferSelect)['status'];
  paymentStatus: (typeof payments.$inferSelect)['status'];
  amountCents: number;
  reservedUntil: string | null;
  sessionId: string | null;
};

/** Für die Rücksprungseite: Stand der Zahlung zu einer (nicht erratbaren) Referenz – ohne Personendaten. */
export function getCheckoutView(db: Db, ref: string): CheckoutView | undefined {
  const row = db
    .select({ p: payments, reg: registrations, event: events })
    .from(payments)
    .innerJoin(registrations, eq(registrations.id, payments.registrationId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(payments.publicRef, ref))
    .get();
  if (!row) return undefined;
  return {
    ref,
    eventSlug: row.event.slug,
    eventName: row.event.name,
    registrationStatus: row.reg.status,
    paymentStatus: row.p.status,
    amountCents: row.p.amountCents,
    reservedUntil: row.reg.reservedUntil,
    sessionId: row.p.stripeCheckoutSessionId,
  };
}

/** Nach einem Abbruch: Zahlung fortsetzen, solange die Reservierung gilt. */
export async function resumeCheckout(db: Db, provider: PaymentProvider, ref: string, locale: 'de' | 'en', now = new Date()): Promise<string> {
  const view = getCheckoutView(db, ref);
  if (!view || !view.sessionId) throw new ServiceError('NOT_FOUND');
  if (view.paymentStatus !== 'pending' || view.registrationStatus !== 'reserved' || !view.reservedUntil || view.reservedUntil <= now.toISOString()) {
    throw new ServiceError('CONFLICT', { _form: 'checkoutClosed' });
  }
  const url = await provider.checkoutUrl(view.sessionId, locale);
  if (!url) throw new ServiceError('CONFLICT', { _form: 'checkoutClosed' });
  return url;
}

export type PaidOutcome = { outcome: 'confirmed' | 'late' | 'duplicate' | 'unknown'; eventId: number | null };

/** Zahlung erfolgreich (Webhook „checkout.session.completed“ mit payment_status=paid bzw. „async_payment_succeeded“). */
export function markCheckoutPaid(
  db: Db,
  data: { sessionId: string; paymentIntentId: string | null; amountCents: number | null },
  now = new Date()
): PaidOutcome {
  return db.transaction(
    (tx) => {
      const payment = tx.select().from(payments).where(eq(payments.stripeCheckoutSessionId, data.sessionId)).get();
      if (!payment || payment.registrationId == null) return { outcome: 'unknown' as const, eventId: null };
      const reg = tx.select().from(registrations).where(eq(registrations.id, payment.registrationId)).get()!;
      if (payment.status === 'succeeded') return { outcome: 'duplicate' as const, eventId: reg.eventId };

      const nowIso = now.toISOString();
      tx.update(payments)
        .set({ status: 'succeeded', paidAt: nowIso, stripePaymentIntentId: data.paymentIntentId })
        .where(eq(payments.id, payment.id))
        .run();

      const late = reg.status !== 'reserved';
      let note = '';
      if (late) {
        const event = tx.select().from(events).where(eq(events.id, reg.eventId)).get()!;
        note = getEventStats(tx, event, now).seatsFree > 0 ? ', nach Ablauf bezahlt' : ', nach Ablauf bezahlt – Event überbucht';
      }
      if (data.amountCents != null && data.amountCents !== payment.amountCents) note += `, Betrag abweichend (${data.amountCents} statt ${payment.amountCents} Cent)`;

      tx.update(registrations)
        .set({ status: 'confirmed', paymentStatus: 'paid', confirmedAt: nowIso, reservedUntil: null, cancelledAt: null, cancelReason: null })
        .where(eq(registrations.id, reg.id))
        .run();
      tx.update(waitlistOffers).set({ acceptedAt: nowIso }).where(and(eq(waitlistOffers.registrationId, reg.id), isNull(waitlistOffers.acceptedAt))).run();
      writeAudit(tx, SYSTEM, {
        action: 'payment.succeeded',
        entity: 'registration',
        entityId: reg.id,
        eventId: reg.eventId,
        summary: `Online-Zahlung erhalten${note}`,
      });
      return { outcome: late ? ('late' as const) : ('confirmed' as const), eventId: reg.eventId };
    },
    { behavior: 'immediate' }
  );
}

/** Kassensitzung abgelaufen oder Zahlung fehlgeschlagen: Reservierung stornieren, Platz frei. */
export function markCheckoutClosed(db: Db, sessionId: string, kind: 'expired' | 'failed', now = new Date()): { eventId: number | null; released: boolean } {
  return db.transaction(
    (tx) => {
      const payment = tx.select().from(payments).where(eq(payments.stripeCheckoutSessionId, sessionId)).get();
      if (!payment || payment.registrationId == null) return { eventId: null, released: false };
      const reg = tx.select().from(registrations).where(eq(registrations.id, payment.registrationId)).get()!;
      if (payment.status !== 'pending') return { eventId: reg.eventId, released: false };
      tx.update(payments).set({ status: kind }).where(eq(payments.id, payment.id)).run();
      if (reg.status !== 'reserved') return { eventId: reg.eventId, released: false };
      tx.update(registrations)
        .set({
          status: 'cancelled',
          cancelledAt: now.toISOString(),
          cancelReason: kind === 'expired' ? 'Reservierung abgelaufen (keine Zahlung)' : 'Online-Zahlung fehlgeschlagen',
          reservedUntil: null,
        })
        .where(eq(registrations.id, reg.id))
        .run();
      writeAudit(tx, SYSTEM, {
        action: kind === 'expired' ? 'reservation.expired' : 'payment.failed',
        entity: 'registration',
        entityId: reg.id,
        eventId: reg.eventId,
        summary: kind === 'expired' ? 'Reservierung abgelaufen, Platz freigegeben' : 'Zahlung fehlgeschlagen, Platz freigegeben',
      });
      return { eventId: reg.eventId, released: true };
    },
    { behavior: 'immediate' }
  );
}

/** Zeitplan: Reservierungen, deren Kassensitzung (plus Puffer) abgelaufen ist, freigeben. Gibt betroffene Events zurück. */
export function expireStaleReservations(db: Db, now = new Date()): number[] {
  const cutoff = new Date(now.getTime() - EXPIRY_GRACE_MS).toISOString();
  return db.transaction(
    (tx) => {
      const stale = tx
        .select()
        .from(registrations)
        .where(and(eq(registrations.status, 'reserved'), lt(registrations.reservedUntil, cutoff)))
        .all();
      if (stale.length === 0) return [];
      const ids = stale.map((r) => r.id);
      tx.update(payments)
        .set({ status: 'expired' })
        .where(and(inArray(payments.registrationId, ids), eq(payments.status, 'pending')))
        .run();
      for (const reg of stale) {
        tx.update(registrations)
          .set({ status: 'cancelled', cancelledAt: now.toISOString(), cancelReason: 'Reservierung abgelaufen (keine Zahlung)', reservedUntil: null })
          .where(eq(registrations.id, reg.id))
          .run();
        writeAudit(tx, SYSTEM, { action: 'reservation.expired', entity: 'registration', entityId: reg.id, eventId: reg.eventId, summary: 'Reservierung abgelaufen, Platz freigegeben (Zeitplan)' });
      }
      return [...new Set(stale.map((r) => r.eventId))];
    },
    { behavior: 'immediate' }
  );
}
