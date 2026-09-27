'use server';

/** Admin-Aktionen zu Storno und Erstattung. */
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { parseEuroToCents } from '@/lib/money';
import { approveRefundSchema, manualRefundSchema, refundTransferSchema, rejectRefundSchema } from '@/lib/validation/refunds';
import { payments } from '@/server/db/schema';
import { executeRefundAndNotify, sendRefundMail } from '@/server/services/cancellation';
import {
  approveRefund,
  createManualRefund,
  quoteCancellation,
  recordRefundTransfer,
  rejectRefund,
  type CancellationQuote,
} from '@/server/services/refunds';
import { runAdminAction } from './run';

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
    const created = createManualRefund(db, actor, id.data, { amountCents: parseEuroToCents(parsed.data.amount)!, reason: parsed.data.reason });
    let status: RefundActionResult['status'] = 'approved';
    for (const r of created) {
      const payment = db.select().from(payments).where(eq(payments.id, r.paymentId)).get()!;
      if (payment.method !== 'stripe') continue;
      const out = await executeRefundAndNotify(db, actor, r.id);
      status = out.status === 'failed' ? 'failed' : status === 'approved' ? 'executed' : status;
    }
    return { status };
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
