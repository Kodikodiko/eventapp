'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { packageFormSchema, sponsorFormSchema, toPackageInput, toSponsorInput } from '@/lib/validation/sponsors';
import { createPackage, createSponsor, deletePackage, deleteSponsor, updatePackage, updateSponsor } from '@/server/services/sponsors';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

export async function createPackageAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = packageFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createPackage(db, actor, id.data, toPackageInput(parsed.data)) }));
}

export async function updatePackageAction(packageId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(packageId);
  const parsed = packageFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updatePackage(db, actor, id.data, toPackageInput(parsed.data)));
}

export async function deletePackageAction(packageId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(packageId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deletePackage(db, actor, id.data));
}

export async function createSponsorAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = sponsorFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createSponsor(db, actor, id.data, toSponsorInput(parsed.data)) }));
}

export async function updateSponsorAction(sponsorId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(sponsorId);
  const parsed = sponsorFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateSponsor(db, actor, id.data, toSponsorInput(parsed.data)));
}

export async function deleteSponsorAction(sponsorId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(sponsorId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deleteSponsor(db, actor, id.data));
}
