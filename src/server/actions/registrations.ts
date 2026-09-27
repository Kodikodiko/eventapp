'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import {
  cancelSchema,
  registrationCreateSchema,
  registrationUpdateSchema,
  toRegistrationInput,
} from '@/lib/validation/registrations';
import {
  cancelRegistrationByAdmin,
  confirmWaitlistedByAdmin,
  createRegistrationByAdmin,
  updateRegistrationByAdmin,
} from '@/server/services/registrations';
import { fillFreeSeats } from '@/server/services/automation';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

export async function createRegistrationAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = registrationCreateSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const input = { ...toRegistrationInput(parsed.data), status: parsed.data.status, overbook: parsed.data.overbook };
  return runAdminAction(({ actor, db }) => ({ id: createRegistrationByAdmin(db, actor, id.data, input) }));
}

export async function updateRegistrationAction(registrationId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(registrationId);
  const parsed = registrationUpdateSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateRegistrationByAdmin(db, actor, id.data, toRegistrationInput(parsed.data)));
}

export async function cancelRegistrationAction(registrationId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(registrationId);
  const parsed = cancelSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(async ({ actor, db }) => {
    const eventId = cancelRegistrationByAdmin(db, actor, id.data, parsed.data.reason);
    // frei gewordenen Platz sofort der Warteliste anbieten
    await fillFreeSeats(db, [eventId]);
  });
}

export async function confirmWaitlistedAction(registrationId: number, overbook: boolean): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(registrationId);
  if (!id.success || typeof overbook !== 'boolean') return fail('INVALID');
  return runAdminAction(({ actor, db }) => confirmWaitlistedByAdmin(db, actor, id.data, overbook));
}
