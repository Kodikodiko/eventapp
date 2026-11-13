'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { MAX_COMPARE_EVENTS, PLAN_VARIANT_KEYS, planFormSchema, toPlanInput } from '@/lib/validation/pnl';
import { savePlan, setComparisons } from '@/server/services/pnl';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

/** Plan einer Variante der Erfolgsrechnung speichern. */
export async function savePlanAction(eventId: number, variant: string, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  const v = z.enum(PLAN_VARIANT_KEYS).safeParse(variant);
  if (!id.success || !v.success) return fail('NOT_FOUND');
  const parsed = planFormSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => savePlan(db, actor, id.data, v.data, toPlanInput(parsed.data)));
}

/** Vergleichs-Events der Erfolgsrechnung festlegen (höchstens zwei). */
export async function setComparisonsAction(eventId: number, compareIds: number[]): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  const ids = z.array(idSchema).max(MAX_COMPARE_EVENTS).safeParse(compareIds);
  if (!id.success) return fail('NOT_FOUND');
  if (!ids.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => setComparisons(db, actor, id.data, ids.data));
}
