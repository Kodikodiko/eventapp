'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { costGroupFormSchema, expenseFormSchema, toCostGroupInput, toExpenseInput } from '@/lib/validation/expenses';
import type { ReceiptUpload } from '@/server/receipts/storage';
import {
  addTemplatesToEvent,
  createEventGroup,
  createExpense,
  createTemplate,
  deleteExpense,
  publishEventGroup,
  setEventGroupActive,
  setTemplateActive,
  updateEventGroup,
  updateExpense,
  updateTemplate,
} from '@/server/services/expenses';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

// ---------------------------------------------------------------------------
// Vorlagen
// ---------------------------------------------------------------------------

export async function createTemplateAction(values: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = costGroupFormSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createTemplate(db, actor, toCostGroupInput(parsed.data)) }));
}

export async function updateTemplateAction(templateId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(templateId);
  const parsed = costGroupFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateTemplate(db, actor, id.data, toCostGroupInput(parsed.data)));
}

export async function setTemplateActiveAction(templateId: number, active: boolean): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(templateId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => setTemplateActive(db, actor, id.data, active === true));
}

// ---------------------------------------------------------------------------
// Kostengruppen eines Events
// ---------------------------------------------------------------------------

export async function createEventGroupAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = costGroupFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createEventGroup(db, actor, id.data, toCostGroupInput(parsed.data)) }));
}

export async function updateEventGroupAction(groupId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(groupId);
  const parsed = costGroupFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateEventGroup(db, actor, id.data, toCostGroupInput(parsed.data)));
}

export async function setEventGroupActiveAction(groupId: number, active: boolean): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(groupId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => setEventGroupActive(db, actor, id.data, active === true));
}

export async function publishEventGroupAction(groupId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(groupId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => {
    publishEventGroup(db, actor, id.data);
  });
}

export async function addTemplatesToEventAction(eventId: number): Promise<ActionResult<{ added: number }>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => ({ added: addTemplatesToEvent(db, actor, id.data) }));
}

// ---------------------------------------------------------------------------
// Ausgaben (Formularwerte als JSON im Feld „values“, Beleg optional im Feld „receipt“)
// ---------------------------------------------------------------------------

function readExpenseForm(formData: FormData) {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('values') ?? ''));
  } catch {
    return { error: fail('INVALID') };
  }
  const parsed = expenseFormSchema.safeParse(raw);
  if (!parsed.success) return { error: fail('INVALID', issuesToFieldErrors(parsed.error)) };
  const file = formData.get('receipt');
  const receipt = file instanceof File && file.size > 0 ? file : null;
  return { values: parsed.data, receipt };
}

async function toUpload(file: File | null): Promise<ReceiptUpload | null> {
  return file ? { fileName: file.name, data: Buffer.from(await file.arrayBuffer()) } : null;
}

export async function createExpenseAction(eventId: number, formData: FormData): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return fail('NOT_FOUND');
  const form = readExpenseForm(formData);
  if (form.error) return form.error;
  // Datei erst nach der Rechteprüfung einlesen
  return runAdminAction(async ({ actor, db }) => ({
    id: createExpense(db, actor, id.data, toExpenseInput(form.values), await toUpload(form.receipt)),
  }));
}

export async function updateExpenseAction(expenseId: number, formData: FormData): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(expenseId);
  if (!id.success) return fail('NOT_FOUND');
  const form = readExpenseForm(formData);
  if (form.error) return form.error;
  return runAdminAction(async ({ actor, db }) =>
    updateExpense(db, actor, id.data, toExpenseInput(form.values), { upload: await toUpload(form.receipt), remove: form.values.removeReceipt })
  );
}

export async function deleteExpenseAction(expenseId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(expenseId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deleteExpense(db, actor, id.data));
}
