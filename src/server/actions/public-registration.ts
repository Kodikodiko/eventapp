'use server';

/**
 * Öffentliche Server Actions (ohne Anmeldung): Preis prüfen und anmelden.
 * Schutz: Honeypot-Feld, Begrenzung pro IP, serverseitige Preisberechnung.
 */
import { headers } from 'next/headers';
import { z } from 'zod';
import { fail, issuesToFieldErrors, ok, ServiceError, type ActionResult } from '@/lib/action-result';
import {
  publicRegistrationMetaSchema,
  publicRegistrationSchema,
  toPublicRegistrationInput,
} from '@/lib/validation/public-registration';
import { getDb } from '@/server/db';
import { isStripeConfigured } from '@/server/payments/config';
import { clientIp, RATE_LIMITS, takeToken } from '@/server/rate-limit';
import { getEvent } from '@/server/services/events';
import { quotePrice, registerPublic, type MemberCheck, type PublicRegistrationResult } from '@/server/services/public-registration';

async function limited(kind: keyof typeof RATE_LIMITS): Promise<boolean> {
  return !takeToken(`${kind}:${clientIp(await headers())}`, RATE_LIMITS[kind]);
}

const quoteSchema = z.object({
  eventId: z.number().int().positive(),
  memberNumber: z.string().trim().max(50),
  lastName: z.string().trim().max(100),
});

export async function quotePriceAction(
  values: unknown
): Promise<ActionResult<{ priceCents: number; ticketType: 'normal' | 'member'; memberCheck: MemberCheck }>> {
  const parsed = quoteSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID');
  if (await limited('quote')) return fail('CONFLICT', { _form: 'tooManyRequests' });
  const db = getDb();
  const event = getEvent(db, parsed.data.eventId);
  if (!event || event.archivedAt) return fail('NOT_FOUND');
  const q = quotePrice(db, event, parsed.data.memberNumber || null, parsed.data.lastName);
  return ok({ priceCents: q.priceCents, ticketType: q.ticketType, memberCheck: q.memberCheck });
}

export type PublicRegistrationOutcome = Omit<PublicRegistrationResult, 'registrationId'>;

export async function registerPublicAction(meta: unknown, values: unknown): Promise<ActionResult<PublicRegistrationOutcome>> {
  const m = publicRegistrationMetaSchema.safeParse(meta);
  if (!m.success) return fail('INVALID');
  const parsed = publicRegistrationSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  if (await limited('register')) return fail('CONFLICT', { _form: 'tooManyRequests' });

  const input = toPublicRegistrationInput(parsed.data, m.data);
  if (parsed.data.website) {
    // Honeypot ausgefüllt: vermutlich ein Bot. Scheinbar erfolgreich antworten, nichts speichern.
    return ok({ status: 'confirmed', paymentMethod: 'free', priceCents: 0, ticketType: 'normal', memberCheck: 'none', reservedUntil: null });
  }
  try {
    const { registrationId: _id, ...result } = registerPublic(getDb(), m.data.eventId, input, { stripeEnabled: isStripeConfigured() });
    return ok(result);
  } catch (error) {
    if (error instanceof ServiceError) return fail(error.code, error.fieldErrors);
    console.error('[public] Anmeldung fehlgeschlagen', error instanceof Error ? error.message : error);
    return fail('UNEXPECTED');
  }
}
