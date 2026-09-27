/**
 * Warteliste (Spezifikation 3.1): Wird ein Platz frei, bekommt die erste wartende Person ein Angebot per E-Mail,
 * gültig 48 Stunden. Offene Angebote halten den Platz (zählen in der Belegung). Wird ein Angebot nicht angenommen,
 * verfällt die Wartelisten-Anmeldung und die nächste Person ist dran.
 * Annehmen: kostenlos/Rechnung → sofort bestätigt; Online-Zahlung → Reservierung + Kasse (bestätigt erst nach Zahlung).
 */
import { randomBytes } from 'node:crypto';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { Db } from '@/server/db/core';
import { events, people, registrations, waitlistOffers } from '@/server/db/schema';
import type { OfferMailData } from '@/server/mail/templates';
import { SYSTEM, writeAudit, type Tx } from './audit';
import { CHECKOUT_VALID_MS } from './checkout';
import { getEventStats } from './events';

export const OFFER_VALID_MS = 48 * 60 * 60_000;

/** Freie Plätze an die Warteliste vergeben. Gibt die zu versendenden Angebote zurück (Versand macht der Aufrufer). */
export function offerFreeSeats(db: Db, eventId: number, now = new Date()): OfferMailData[] {
  return db.transaction(
    (tx) => {
      const event = tx.select().from(events).where(eq(events.id, eventId)).get();
      if (!event || event.archivedAt || event.startsAt <= now.toISOString()) return [];
      let free = getEventStats(tx, event, now).seatsFree;
      if (free <= 0) return [];
      const waiting = tx
        .select({ reg: registrations, person: people })
        .from(registrations)
        .innerJoin(people, eq(people.id, registrations.personId))
        .where(and(eq(registrations.eventId, eventId), eq(registrations.status, 'waitlisted')))
        .orderBy(asc(registrations.createdAt), asc(registrations.id))
        .all();
      const notices: OfferMailData[] = [];
      for (const { reg, person } of waiting) {
        if (free <= 0) break;
        const open = tx
          .select({ id: waitlistOffers.id })
          .from(waitlistOffers)
          .where(and(eq(waitlistOffers.registrationId, reg.id), isNull(waitlistOffers.acceptedAt), isNull(waitlistOffers.closedAt), gt(waitlistOffers.expiresAt, now.toISOString())))
          .get();
        if (open) continue;
        // ohne erreichbare Adresse (gesperrt/anonymisiert) kein Angebot – Admin entscheidet
        if (!person.email || person.restrictedAt || person.anonymizedAt) continue;
        const token = randomBytes(24).toString('base64url');
        const expiresAt = new Date(now.getTime() + OFFER_VALID_MS).toISOString();
        const [offer] = tx
          .insert(waitlistOffers)
          .values({ registrationId: reg.id, token, offeredAt: now.toISOString(), expiresAt })
          .returning({ id: waitlistOffers.id })
          .all();
        writeAudit(tx, SYSTEM, { action: 'waitlist.offered', entity: 'registration', entityId: reg.id, eventId, summary: `Platz angeboten (Angebot ${offer.id}, 48 h gültig)` });
        notices.push({
          email: person.email,
          firstName: person.firstName,
          lastName: person.lastName,
          locale: person.locale,
          eventName: event.name,
          token,
          expiresAt,
          priceCents: reg.priceCents,
        });
        free--;
      }
      return notices;
    },
    { behavior: 'immediate' }
  );
}

/** Zeitplan: abgelaufene Angebote schließen, die Wartelisten-Anmeldung verfällt. Gibt betroffene Events zurück. */
export function expireOffers(db: Db, now = new Date()): number[] {
  return db.transaction(
    (tx) => {
      const expired = tx
        .select({ offer: waitlistOffers, reg: registrations })
        .from(waitlistOffers)
        .innerJoin(registrations, eq(registrations.id, waitlistOffers.registrationId))
        .where(and(isNull(waitlistOffers.acceptedAt), isNull(waitlistOffers.closedAt), lte(waitlistOffers.expiresAt, now.toISOString())))
        .all();
      const eventIds = new Set<number>();
      for (const { offer, reg } of expired) {
        tx.update(waitlistOffers).set({ closedAt: now.toISOString() }).where(eq(waitlistOffers.id, offer.id)).run();
        if (reg.status !== 'waitlisted') continue;
        tx.update(registrations)
          .set({ status: 'cancelled', cancelledAt: now.toISOString(), cancelReason: 'Wartelisten-Angebot nicht angenommen' })
          .where(eq(registrations.id, reg.id))
          .run();
        writeAudit(tx, SYSTEM, { action: 'waitlist.expired', entity: 'registration', entityId: reg.id, eventId: reg.eventId, summary: `Angebot ${offer.id} nicht angenommen, Wartelistenplatz verfallen` });
        eventIds.add(reg.eventId);
      }
      return [...eventIds];
    },
    { behavior: 'immediate' }
  );
}

export type OfferView = {
  state: 'open' | 'expired' | 'accepted' | 'closed';
  eventName: (typeof events.$inferSelect)['name'];
  eventSlug: string;
  startsAt: string;
  endsAt: string;
  priceCents: number;
  ticketType: 'normal' | 'member';
  paymentMethod: 'stripe' | 'invoice' | 'free';
  expiresAt: string;
};

function loadOffer(db: Db | Tx, token: string) {
  return db
    .select({ offer: waitlistOffers, reg: registrations, event: events })
    .from(waitlistOffers)
    .innerJoin(registrations, eq(registrations.id, waitlistOffers.registrationId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(waitlistOffers.token, token))
    .get();
}

function stateOf(row: NonNullable<ReturnType<typeof loadOffer>>, now: Date): OfferView['state'] {
  if (row.offer.acceptedAt || row.reg.status === 'confirmed' || row.reg.status === 'reserved') return 'accepted';
  if (row.offer.closedAt || row.reg.status !== 'waitlisted' || row.event.archivedAt) return 'closed';
  if (row.offer.expiresAt <= now.toISOString()) return 'expired';
  return 'open';
}

/** Für die Angebotsseite (Link aus der E-Mail): ohne Personendaten. */
export function getOfferView(db: Db, token: string, now = new Date()): OfferView | undefined {
  const row = loadOffer(db, token);
  if (!row) return undefined;
  return {
    state: stateOf(row, now),
    eventName: row.event.name,
    eventSlug: row.event.slug,
    startsAt: row.event.startsAt,
    endsAt: row.event.endsAt,
    priceCents: row.reg.priceCents,
    ticketType: row.reg.ticketType,
    paymentMethod: row.reg.paymentMethod,
    expiresAt: row.offer.expiresAt,
  };
}

export type AcceptResult = { registrationId: number; status: 'confirmed' | 'reserved'; paymentMethod: 'stripe' | 'invoice' | 'free' };

export function acceptOffer(db: Db, token: string, options: { onlinePaymentEnabled: boolean; now?: Date }): AcceptResult {
  const now = options.now ?? new Date();
  return db.transaction(
    (tx) => {
      const row = loadOffer(tx, token);
      if (!row) throw new ServiceError('NOT_FOUND');
      const state = stateOf(row, now);
      if (state !== 'open') throw new ServiceError('CONFLICT', { _form: state === 'expired' ? 'offerExpired' : 'offerClosed' });
      const { reg } = row;
      const nowIso = now.toISOString();
      let status: AcceptResult['status'] = 'confirmed';
      if (reg.paymentMethod === 'stripe') {
        if (!options.onlinePaymentEnabled) throw new ServiceError('CONFLICT', { _form: 'onlinePaymentUnavailable' });
        status = 'reserved';
        tx.update(registrations)
          .set({ status, reservedUntil: new Date(now.getTime() + CHECKOUT_VALID_MS).toISOString() })
          .where(eq(registrations.id, reg.id))
          .run();
      } else {
        tx.update(registrations)
          .set({ status, confirmedAt: nowIso, paymentStatus: reg.paymentMethod === 'free' ? 'not_required' : 'open' })
          .where(eq(registrations.id, reg.id))
          .run();
      }
      tx.update(waitlistOffers).set({ acceptedAt: nowIso }).where(eq(waitlistOffers.id, row.offer.id)).run();
      writeAudit(tx, SYSTEM, {
        action: 'waitlist.accepted',
        entity: 'registration',
        entityId: reg.id,
        eventId: reg.eventId,
        summary: status === 'reserved' ? 'Angebot angenommen, Zahlung ausstehend' : 'Angebot angenommen, bestätigt',
      });
      return { registrationId: reg.id, status, paymentMethod: reg.paymentMethod };
    },
    { behavior: 'immediate' }
  );
}

/** Events mit wartenden Personen (für den Zeitplan). */
export function eventsWithWaitlist(db: Db): number[] {
  return [
    ...new Set(
      db
        .select({ eventId: registrations.eventId })
        .from(registrations)
        .innerJoin(events, eq(events.id, registrations.eventId))
        .where(and(eq(registrations.status, 'waitlisted'), isNull(events.archivedAt)))
        .all()
        .map((r) => r.eventId)
    ),
  ];
}

