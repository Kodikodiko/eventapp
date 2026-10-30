'use server';

/** Admin-Aktionen zu Storno und Erstattung. */
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { parseEuroToCents } from '@/lib/money';
import { approveRefundSchema, bulkRefundSchema, manualRefundSchema, refundTransferSchema, rejectRefundSchema } from '@/lib/validation/refunds';
import { payments } from '@/server/db/schema';
import { fillFreeSeats } from '@/server/services/automation';
import { previewBulkRefund, runBulkRefund, type BulkRefundInput, type BulkRefundPreview, type BulkRefundResult } from '@/server/services/bulk-refunds';
import { executeRefundAndNotify, refundAndProcess, sendRefundMail } from '@/server/services/cancellation';
import {
  approveRefund,
  quoteCancellation,
  recordRefundTransfer,
  rejectRefund,
  type CancellationQuote,
} from '@/server/services/refunds';
import { runAdminAction, runAdminQuery } from './run';

const idSchema = z.number().int().positive();

export type RefundActionResult = { status: 'executed' | 'failed' | 'approved' };

export async function quoteCancellationAction(registrationId: number): Promise<ActionResult<CancellationQuote>> {
  const id = idSchema.safeParse(registrationId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ db }) => quoteCancellation(db, id.data));
}

export async function manualRefundAction(registrationId: number, values: unknown): Promise<ActionResult<RefundActionResult>> {
  const id = idSchema.safeParse(registrationId);
  const parsed = manualRefundSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(async ({ actor, db }) => {
    const r = await refundAndProcess(db, actor, id.data, {
      amountCents: parseEuroToCents(parsed.data.amount)!,
      reason: parsed.data.reason,
      transferDone: parsed.data.transferDone,
    });
    return { status: r.status };
  });
}

export async function approveRefundAction(refundId: number, values: unknown): Promise<ActionResult<RefundActionResult>> {
  const id = idSchema.safeParse(refundId);
  const parsed = approveRefundSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(async ({ actor, db }) => {
    const r = approveRefund(db, actor, id.data, parseEuroToCents(parsed.data.amount)!);
    const payment = db.select().from(payments).where(eq(payments.id, r.paymentId)).get()!;
    if (payment.method !== 'stripe') return { status: 'approved' as const };
    return { status: (await executeRefundAndNotify(db, actor, r.id)).status };
  });
}

export async function retryRefundAction(refundId: number): Promise<ActionResult<RefundActionResult>> {
  const id = idSchema.safeParse(refundId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(async ({ actor, db }) => ({ status: (await executeRefundAndNotify(db, actor, id.data)).status }));
}

export async function rejectRefundAction(refundId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(refundId);
  const parsed = rejectRefundSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => rejectRefund(db, actor, id.data, parsed.data.note));
}

export async function recordRefundTransferAction(refundId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(refundId);
  const parsed = refundTransferSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(async ({ actor, db }) => {
    const done = recordRefundTransfer(db, actor, id.data, parsed.data.transferredOn);
    await sendRefundMail(db, done);
  });
}

const bulkIdsSchema = z.array(idSchema).min(1).max(1000);

function bulkInput(ids: unknown, values: unknown): BulkRefundInput | ActionResult<never> {
  const idList = bulkIdsSchema.safeParse(ids);
  const parsed = bulkRefundSchema.safeParse(values);
  if (!idList.success) return fail('INVALID');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return { ids: idList.data, ...parsed.data, percent: Number(parsed.data.percent) };
}

/** Vorschau der Sammel-Erstattung: Beträge je Anmeldung und Summe (ändert nichts). */
export async function previewBulkRefundAction(ids: unknown, values: unknown): Promise<ActionResult<BulkRefundPreview>> {
  const input = bulkInput(ids, values);
  if ('ok' in input) return input;
  return runAdminQuery(({ db }) => previewBulkRefund(db, input));
}

export async function bulkRefundAction(ids: unknown, values: unknown): Promise<ActionResult<BulkRefundResult>> {
  const input = bulkInput(ids, values);
  if ('ok' in input) return input;
  return runAdminAction(async ({ actor, db }) => {
    const result = await runBulkRefund(db, actor, input);
    if (input.cancel) await fillFreeSeats(db, [result.eventId]);
    return result;
  });
}
