'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { discountCodeFormSchema, priceCategoryFormSchema, toDiscountCodeInput, toPriceCategoryInput } from '@/lib/validation/pricing';
import {
  createDiscountCode,
  createPriceCategory,
  deleteDiscountCode,
  deletePriceCategory,
  updateDiscountCode,
  updatePriceCategory,
} from '@/server/services/pricing';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

export async function createPriceCategoryAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = priceCategoryFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createPriceCategory(db, actor, id.data, toPriceCategoryInput(parsed.data)) }));
}

export async function updatePriceCategoryAction(categoryId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(categoryId);
  const parsed = priceCategoryFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updatePriceCategory(db, actor, id.data, toPriceCategoryInput(parsed.data)));
}

export async function deletePriceCategoryAction(categoryId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(categoryId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deletePriceCategory(db, actor, id.data));
}

export async function createDiscountCodeAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = discountCodeFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createDiscountCode(db, actor, id.data, toDiscountCodeInput(parsed.data)) }));
}

export async function updateDiscountCodeAction(codeId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(codeId);
  const parsed = discountCodeFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateDiscountCode(db, actor, id.data, toDiscountCodeInput(parsed.data)));
}

export async function deleteDiscountCodeAction(codeId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(codeId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deleteDiscountCode(db, actor, id.data));
}
