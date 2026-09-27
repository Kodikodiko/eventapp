/**
 * Öffentliche Anmeldung (Spezifikation 3.1, DSGVO 7.3).
 *
 * - Preis und Mitgliedsberechtigung bestimmt nur der Server; weicht der angezeigte Preis ab, wird abgebrochen
 *   (priceChanged), damit niemand zu einem Preis angemeldet wird, den er nicht gesehen hat.
 * - Freie Plätze gehen zuerst an die Warteliste: Solange jemand wartet, kommen neue Anmeldungen ebenfalls
 *   auf die Warteliste (Nachrücken per Angebot folgt in Phase 6).
 * - Stripe → „reserved“ für 30 Minuten; Rechnung → sofort „confirmed“ mit offener Zahlung; Preis 0 → „confirmed“, kostenlos.
 * - Eine bestehende Person (E-Mail) wird wiederverwendet, ihre Stammdaten werden aber nicht mit ungeprüften
 *   Eingaben überschrieben (nur leere Firma wird ergänzt). Änderungen macht die Person im Portal oder ein Admin.
 * - AGB- und Datenschutz-Fassung werden als Zustimmung mit Zeitpunkt gespeichert, Foto und Newsletter nur bei Opt-in.
 */
import { randomUUID } from 'node:crypto';
import { and, count, eq, ne } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { viennaDate } from '@/lib/dates';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import type { Db } from '@/server/db/core';
import { consents, events, people, registrationRoles, registrations, roles } from '@/server/db/schema';
import { SYSTEM, writeAudit, type Tx } from './audit';
import type { EventRow } from './events';
import { findValidMember } from './members';
import { getAvailability } from './public-events';

export const STRIPE_RESERVATION_MINUTES = 30;

export type MemberCheck = 'none' | 'valid' | 'invalid';
export type PriceQuote = { priceCents: number; ticketType: 'normal' | 'member'; memberId: number | null; memberCheck: MemberCheck };

export function quotePrice(db: Db | Tx, event: EventRow, memberNumber: string | null, lastName: string, now = new Date()): PriceQuote {
  const normal: PriceQuote = { priceCents: event.priceNormalCents, ticketType: 'normal', memberId: null, memberCheck: 'none' };
  if (!memberNumber?.trim()) return normal;
  const member = findValidMember(db, memberNumber, lastName, viennaDate(now.toISOString()));
  if (!member) return { ...normal, memberCheck: 'invalid' };
  return { priceCents: event.priceMemberCents, ticketType: 'member', memberId: member.id, memberCheck: 'valid' };
}

export type PublicRegistrationResult = {
  registrationId: number;
  status: 'confirmed' | 'waitlisted' | 'reserved';
  paymentMethod: 'stripe' | 'invoice' | 'free';
  priceCents: number;
  ticketType: 'normal' | 'member';
  memberCheck: MemberCheck;
  reservedUntil: string | null;
};

function findOrCreatePerson(tx: Tx, input: PublicRegistrationInput): number {
  const existing = tx.select().from(people).where(eq(people.email, input.email)).get();
  if (!existing) {
    const [row] = tx
      .insert(people)
      .values({ firstName: input.firstName, lastName: input.lastName, email: input.email, company: input.company, locale: input.locale })
      .returning({ id: people.id })
      .all();
    return row.id;
  }
  if (existing.restrictedAt) throw new ServiceError('CONFLICT', { _form: 'registrationNotPossible' });
  if (!existing.company && input.company) {
    tx.update(people).set({ company: input.company, updatedAt: new Date().toISOString() }).where(eq(people.id, existing.id)).run();
  }
  return existing.id;
}

export function registerPublic(
  db: Db,
  eventId: number,
  input: PublicRegistrationInput,
  options: { stripeEnabled: boolean; now?: Date }
): PublicRegistrationResult {
  const now = options.now ?? new Date();
  return db.transaction(
    (tx) => {
      const event = tx.select().from(events).where(eq(events.id, eventId)).get();
      if (!event || event.archivedAt) throw new ServiceError('NOT_FOUND');
      const availability = getAvailability(tx, event, options.stripeEnabled, now);
      if (availability.state !== 'open') throw new ServiceError('CONFLICT', { _form: 'registrationClosed' });
      if (availability.termsDocumentId !== input.termsDocumentId || availability.privacyDocumentId !== input.privacyDocumentId) {
        throw new ServiceError('CONFLICT', { _form: 'legalChanged' });
      }

      const quote = quotePrice(tx, event, input.memberNumber, input.lastName, now);
      if (quote.priceCents !== input.expectedPriceCents) throw new ServiceError('CONFLICT', { _form: 'priceChanged' });

      let paymentMethod: PublicRegistrationResult['paymentMethod'] = 'free';
      if (quote.priceCents > 0) {
        if (!input.paymentMethod || !availability.paymentMethods.includes(input.paymentMethod)) {
          throw new ServiceError('INVALID', { paymentMethod: 'choosePaymentMethod' });
        }
        if (input.paymentMethod === 'invoice' && (!input.billingCompany || !input.billingAddress)) {
          throw new ServiceError('INVALID', {
            ...(input.billingCompany ? {} : { billingCompany: 'requiredForInvoice' }),
            ...(input.billingAddress ? {} : { billingAddress: 'requiredForInvoice' }),
          });
        }
        paymentMethod = input.paymentMethod;
      }

      const personId = findOrCreatePerson(tx, input);
      const active =
        tx
          .select({ n: count() })
          .from(registrations)
          .where(and(eq(registrations.eventId, eventId), eq(registrations.personId, personId), ne(registrations.status, 'cancelled')))
          .get()?.n ?? 0;
      if (active > 0) throw new ServiceError('CONFLICT', { email: 'emailAlreadyRegistered' });

      const nowIso = now.toISOString();
      let status: PublicRegistrationResult['status'];
      let reservedUntil: string | null = null;
      if (availability.waitlistOnly) status = 'waitlisted';
      else if (paymentMethod === 'stripe') {
        status = 'reserved';
        reservedUntil = new Date(now.getTime() + STRIPE_RESERVATION_MINUTES * 60_000).toISOString();
      } else status = 'confirmed';

      const invoice = paymentMethod === 'invoice';
      const [reg] = tx
        .insert(registrations)
        .values({
          eventId,
          personId,
          status,
          paymentMethod,
          paymentStatus: paymentMethod === 'free' ? 'not_required' : 'open',
          ticketType: quote.ticketType,
          memberId: quote.memberId,
          memberNumberEntered: input.memberNumber,
          priceCents: quote.priceCents,
          billingCompany: invoice ? input.billingCompany : null,
          billingAddress: invoice ? input.billingAddress : null,
          source: 'public',
          reservedUntil,
          createdAt: nowIso,
          confirmedAt: status === 'confirmed' ? nowIso : null,
          qrToken: randomUUID(),
        })
        .returning({ id: registrations.id })
        .all();

      const attendee = tx.select({ id: roles.id }).from(roles).where(eq(roles.key, 'attendee')).get();
      if (attendee) tx.insert(registrationRoles).values({ registrationId: reg.id, roleId: attendee.id }).run();

      const consentRows: (typeof consents.$inferInsert)[] = [
        { personId, kind: 'terms', documentId: input.termsDocumentId, eventId, grantedAt: nowIso, source: 'public' },
        { personId, kind: 'privacy', documentId: input.privacyDocumentId, eventId, grantedAt: nowIso, source: 'public' },
      ];
      if (input.photoConsent) consentRows.push({ personId, kind: 'photo', eventId, grantedAt: nowIso, source: 'public' });
      if (input.newsletter) consentRows.push({ personId, kind: 'newsletter', eventId, grantedAt: nowIso, source: 'public' });
      tx.insert(consents).values(consentRows).run();

      writeAudit(tx, SYSTEM, {
        action: 'registration.created',
        entity: 'registration',
        entityId: reg.id,
        eventId,
        summary: `Öffentliche Anmeldung (${status}, ${paymentMethod}, ${quote.ticketType}${quote.memberCheck === 'invalid' ? ', Mitgliedsnummer ungültig' : ''})`,
      });

      return {
        registrationId: reg.id,
        status,
        paymentMethod,
        priceCents: quote.priceCents,
        ticketType: quote.ticketType,
        memberCheck: quote.memberCheck,
        reservedUntil,
      };
    },
    { behavior: 'immediate' }
  );
}
