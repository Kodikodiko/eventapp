'use server';

/**
 * Aktionen des Teilnehmerportals. Jede Aktion prüft die Teilnehmer-Sitzung und beschränkt sich auf die eigene Person.
 */
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { fail, issuesToFieldErrors, ok, ServiceError, type ActionResult } from '@/lib/action-result';
import { ownPersonSchema, portalCancelSchema, portalLoginSchema } from '@/lib/validation/portal';
import { getAuth } from '@/server/auth';
import { assertAttendee, ForbiddenError } from '@/server/auth/session';
import { getDb } from '@/server/db';
import { clientIp, RATE_LIMITS, takeToken } from '@/server/rate-limit';
import { fillFreeSeats } from '@/server/services/automation';
import { cancelAndProcess } from '@/server/services/cancellation';
import { ensurePortalAccount, ownRegistration, portalCancelQuote, portalCanCancel, updateOwnPerson, type PortalCancelQuote } from '@/server/services/portal';

const locale = z.enum(['de', 'en']);
const idSchema = z.number().int().positive();

function toFail(error: unknown): ActionResult<never> {
  if (error instanceof ForbiddenError) return fail('FORBIDDEN');
  if (error instanceof ServiceError) return fail(error.code, error.fieldErrors);
  console.error('[portal] Fehler', error instanceof Error ? error.message : error);
  return fail('UNEXPECTED');
}

/**
 * Anmeldelink anfordern. Antwortet immer gleich (keine Auskunft, ob die Adresse bekannt ist).
 */
export async function requestPortalLinkAction(values: unknown, lang: unknown): Promise<ActionResult<void>> {
  const parsed = portalLoginSchema.safeParse(values);
  const l = locale.safeParse(lang);
  if (!parsed.success || !l.success) return fail('INVALID', parsed.success ? undefined : issuesToFieldErrors(parsed.error));
  const requestHeaders = await headers();
  const email = parsed.data.email.toLowerCase();
  if (!takeToken(`portalLink:${clientIp(requestHeaders)}`, RATE_LIMITS.portalLink)) return fail('CONFLICT', { _form: 'tooManyRequests' });
  // pro Adresse still begrenzen (kein Hinweis, damit Adressen nicht erraten werden können)
  if (!takeToken(`portalLinkEmail:${email}`, RATE_LIMITS.portalLinkEmail)) return ok();
  try {
    const account = ensurePortalAccount(getDb(), email);
    if (account) {
      await getAuth().api.signInMagicLink({
        body: { email: account.email, callbackURL: `/${l.data}/portal`, errorCallbackURL: `/${l.data}/portal/login` },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    console.error('[portal] Link konnte nicht erstellt werden', error instanceof Error ? error.message : error);
  }
  return ok();
}

export async function updateOwnPersonAction(values: unknown): Promise<ActionResult<void>> {
  const parsed = ownPersonSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  try {
    const session = await assertAttendee();
    updateOwnPerson(getDb(), { userId: session.user.id }, session.user.personId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      company: parsed.data.company || null,
      phone: parsed.data.phone || null,
      locale: parsed.data.locale,
    });
    revalidatePath('/', 'layout');
    return ok();
  } catch (error) {
    return toFail(error);
  }
}

export async function portalCancelQuoteAction(registrationId: unknown): Promise<ActionResult<PortalCancelQuote>> {
  const id = idSchema.safeParse(registrationId);
  if (!id.success) return fail('NOT_FOUND');
  try {
    const session = await assertAttendee();
    return ok(portalCancelQuote(getDb(), session.user.personId, id.data));
  } catch (error) {
    return toFail(error);
  }
}

export async function cancelOwnRegistrationAction(registrationId: unknown, values: unknown): Promise<ActionResult<{ refundStatus: 'none' | 'proposed' | 'approved' }>> {
  const id = idSchema.safeParse(registrationId);
  const parsed = portalCancelSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  try {
    const session = await assertAttendee();
    const db = getDb();
    const { reg, event } = ownRegistration(db, session.user.personId, id.data);
    if (!portalCanCancel(reg, event)) throw new ServiceError('CONFLICT', { _form: 'cancelNotPossible' });
    const r = await cancelAndProcess(db, { userId: session.user.id }, id.data, {
      reason: parsed.data.reason || 'Storno durch Teilnehmer:in im Portal',
      source: 'attendee',
      notify: true,
    });
    await fillFreeSeats(db, [r.eventId]);
    revalidatePath('/', 'layout');
    return ok({ refundStatus: r.refundStatus });
  } catch (error) {
    return toFail(error);
  }
}
