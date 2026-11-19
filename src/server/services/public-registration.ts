/**
 * Öffentliche Anmeldung (Spezifikation 3.1, DSGVO 7.3).
 *
 * - Preis und Mitgliedsberechtigung bestimmt nur der Server; weicht der angezeigte Preis ab, wird abgebrochen
 *   (priceChanged), damit niemand zu einem Preis angemeldet wird, den er nicht gesehen hat.
 * - Freie Plätze gehen zuerst an die Warteliste: Solange jemand wartet, kommen neue Anmeldungen ebenfalls
 *   auf die Warteliste (Nachrücken per Angebot folgt in Phase 6).
 * - Preis: Normal- oder Mitgliederpreis, im Early-Bird-Zeitraum der Early-Bird-Preis; ein Rabattcode wirkt nur auf
 *   den Basispreis (siehe src/lib/pricing.ts). Der Code wird in derselben Transaktion erneut geprüft (Kontingent).
 * - Stripe → „reserved“ für 30 Minuten; Rechnung → sofort „confirmed“ mit offener Zahlung; Preis 0 → „confirmed“, kostenlos.
 * - Eine bestehende Person (E-Mail) wird wiederverwendet, ihre Stammdaten werden aber nicht mit ungeprüften
 *   Eingaben überschrieben (nur leere Firma wird ergänzt). Änderungen macht die Person im Portal oder ein Admin.
 * - AGB- und Datenschutz-Fassung werden als Zustimmung mit Zeitpunkt gespeichert, Foto nur bei Opt-in.
 */
import { randomUUID } from 'node:crypto';
import { and, count, eq, ne } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { viennaDate } from '@/lib/dates';
import { computeTicketPrice, type PriceTier } from '@/lib/pricing';
import type { PublicRegistrationInput } from '@/lib/validation/public-registration';
import type { Db } from '@/server/db/core';
import { consents, events, people, registrationRoles, registrations, roles } from '@/server/db/schema';
import { SYSTEM, writeAudit, type Tx } from './audit';
import type { EventRow } from './events';
import { findValidMember } from './members';
import { checkDiscountCode } from './pricing';
import { getAvailability } from './public-events';
import { applySpeakerRoleToRegistration, releaseSpeakerOnlyRegistration } from './speaker-role';

export const STRIPE_RESERVATION_MINUTES = 30;

export type MemberCheck = 'none' | 'valid' | 'invalid';
export type CodeStatus = 'none' | 'valid' | 'invalid' | 'notYetValid' | 'expired' | 'exhausted' | 'earlyBirdCheaper';
export type PriceQuote = {
  priceCents: number;
  /** Preis vor Rabatt (Basis- oder Early-Bird-Preis) */
  listPriceCents: number;
  ticketType: 'normal' | 'member';
  tier: PriceTier;
  memberId: number | null;
  memberCheck: MemberCheck;
  codeStatus: CodeStatus;
  discountCodeId: number | null;
  /** eingelöster Code (normalisiert) oder null */
  code: string | null;
  discountCents: number;
  /** Ende des Early-Bird-Zeitraums, wenn der Preis ein Early-Bird-Preis ist */
  earlyBirdEndsAt: string | null;
};

export function quotePrice(
  db: Db | Tx,
  event: EventRow,
  memberNumber: string | null,
  lastName: string,
  now = new Date(),
  discountCode: string | null = null
): PriceQuote {
  let ticketType: 'normal' | 'member' = 'normal';
  let memberId: number | null = null;
  let memberCheck: MemberCheck = 'none';
  if (memberNumber?.trim()) {
    const member = findValidMember(db, memberNumber, lastName, viennaDate(now.toISOString()));
    if (member) {
      ticketType = 'member';
      memberId = member.id;
      memberCheck = 'valid';
    } else memberCheck = 'invalid';
  }
  let codeStatus: CodeStatus = 'none';
  let discount: { id: number; code: string; kind: 'fixed' | 'percent'; value: number } | null = null;
  if (discountCode?.trim()) {
    const check = checkDiscountCode(db, event.id, discountCode, now);
    codeStatus = check.status;
    if (check.status === 'valid') discount = check.code;
  }
  const price = computeTicketPrice(event, ticketType, discount, now);
  if (discount && price.earlyBirdCheaper) codeStatus = 'earlyBirdCheaper';
  const applied = discount && !price.earlyBirdCheaper ? discount : null;
  return {
    priceCents: price.priceCents,
    listPriceCents: price.listPriceCents,
    ticketType,
    tier: price.tier,
    memberId,
    memberCheck,
    codeStatus,
    discountCodeId: applied?.id ?? null,
    code: applied?.code ?? null,
    discountCents: price.discountCents,
    earlyBirdEndsAt: price.tier === 'early_bird' ? event.earlyBirdEndsAt : null,
  };
}

export type PublicRegistrationResult = {
  registrationId: number;
  status: 'confirmed' | 'waitlisted' | 'reserved';
  paymentMethod: 'stripe' | 'invoice' | 'free';
  priceCents: number;
  ticketType: 'normal' | 'member';
  tier: PriceTier;
  memberCheck: MemberCheck;
  code: string | null;
  discountCents: number;
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
      // Speaker mit reiner Speaker-Anmeldung: Ticketkauf ersetzt sie (ihr Platz wird vorher frei)
      const known = tx.select({ id: people.id }).from(people).where(eq(people.email, input.email)).get();
      if (known) releaseSpeakerOnlyRegistration(tx, SYSTEM, eventId, known.id, 'ersetzt durch Ticketkauf');
      const availability = getAvailability(tx, event, options.stripeEnabled, now);
      if (availability.state !== 'open') throw new ServiceError('CONFLICT', { _form: 'registrationClosed' });
      if (availability.termsDocumentId !== input.termsDocumentId || availability.privacyDocumentId !== input.privacyDocumentId) {
        throw new ServiceError('CONFLICT', { _form: 'legalChanged' });
      }

      const quote = quotePrice(tx, event, input.memberNumber, input.lastName, now, input.discountCode ?? null);
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
          priceTier: quote.tier,
          discountCodeId: quote.discountCodeId,
          discountCents: quote.discountCents,
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
      applySpeakerRoleToRegistration(tx, reg.id, eventId, personId);

      const consentRows: (typeof consents.$inferInsert)[] = [
        { personId, kind: 'terms', documentId: input.termsDocumentId, eventId, grantedAt: nowIso, source: 'public' },
        { personId, kind: 'privacy', documentId: input.privacyDocumentId, eventId, grantedAt: nowIso, source: 'public' },
      ];
      if (input.photoConsent) consentRows.push({ personId, kind: 'photo', eventId, grantedAt: nowIso, source: 'public' });
      tx.insert(consents).values(consentRows).run();

      writeAudit(tx, SYSTEM, {
        action: 'registration.created',
        entity: 'registration',
        entityId: reg.id,
        eventId,
        summary: `Öffentliche Anmeldung (${status}, ${paymentMethod}, ${quote.ticketType}${quote.tier === 'early_bird' ? ', Early Bird' : ''}${
          quote.code ? `, Code ${quote.code}` : ''
        }${quote.memberCheck === 'invalid' ? ', Mitgliedsnummer ungültig' : ''})`,
      });

      return {
        registrationId: reg.id,
        status,
        paymentMethod,
        priceCents: quote.priceCents,
        ticketType: quote.ticketType,
        tier: quote.tier,
        memberCheck: quote.memberCheck,
        code: quote.code,
        discountCents: quote.discountCents,
        reservedUntil,
      };
    },
    { behavior: 'immediate' }
  );
}
