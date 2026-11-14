'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { DSR_TYPES } from '@/server/db/schema';
import {
  completeDsrRequest,
  createDsrRequest,
  erasePerson,
  liftRestriction,
  restrictPerson,
  type AnonymizeResult,
} from '@/server/services/gdpr';
import { formatRetentionSummary, runRetention } from '@/server/services/retention';
import { backupDirFromEnv } from '@/server/db/core';
import { invoiceDir } from '@/server/invoices/storage';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

export async function restrictPersonAction(personId: unknown): Promise<ActionResult> {
  const id = idSchema.safeParse(personId);
  if (!id.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => restrictPerson(db, actor, id.data));
}

export async function liftRestrictionAction(personId: unknown): Promise<ActionResult> {
  const id = idSchema.safeParse(personId);
  if (!id.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => liftRestriction(db, actor, id.data));
}

export async function erasePersonAction(personId: unknown): Promise<ActionResult<AnonymizeResult>> {
  const id = idSchema.safeParse(personId);
  if (!id.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => erasePerson(db, actor, id.data));
}

const dsrSchema = z.object({
  personId: z.number().int().positive().nullable(),
  type: z.enum(DSR_TYPES),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate'),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null)
    .nullable(),
});

export async function createDsrRequestAction(values: unknown): Promise<ActionResult<number>> {
  const parsed = dsrSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => createDsrRequest(db, actor, parsed.data));
}

export async function completeDsrRequestAction(id: unknown): Promise<ActionResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => completeDsrRequest(db, actor, parsed.data));
}

/** Löschlauf sofort ausführen (sonst einmal am Tag mit den Jobs bzw. per `npm run retention`). */
export async function runRetentionAction(): Promise<ActionResult<string>> {
  return runAdminAction(({ db }) =>
    formatRetentionSummary(runRetention(db, { backupDir: backupDirFromEnv(), invoiceDir: invoiceDir() }))
  );
}
