'use server';

/**
 * Admin-Aktionen zu Rechnungen: ausstellen und senden, erneut senden, Zahlungseingang verbuchen, stornieren.
 * Ausstellen/Stornieren gelingt auch dann, wenn der E-Mail-Versand scheitert – das Ergebnis meldet `mailed`.
 */
import { z } from 'zod';
import { fail, issuesToFieldErrors, ServiceError, type ActionResult } from '@/lib/action-result';
import { parseEuroToCents } from '@/lib/money';
import { cancelInvoiceSchema, recordPaymentSchema } from '@/lib/validation/invoices';
import type { Db } from '@/server/db';
import type { Actor } from '@/server/services/audit';
import { cancelInvoice, issueRegistrationInvoice, issueSponsorInvoice, recordBankTransfer } from '@/server/services/invoices';
import { sendInvoiceDocument } from '@/server/services/notifications';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

async function sendQuietly(db: Db, actor: Actor, invoiceId: number): Promise<{ mailed: boolean; mailError?: string }> {
  try {
    await sendInvoiceDocument(db, actor, invoiceId);
    return { mailed: true };
  } catch (error) {
    if (error instanceof ServiceError) return { mailed: false, mailError: error.fieldErrors?._form ?? error.code };
    throw error;
  }
}

export type IssueResult = { invoiceId: number; number: string; mailed: boolean; mailError?: string };

export async function issueRegistrationInvoiceAction(registrationId: number): Promise<ActionResult<IssueResult>> {
  const id = idSchema.safeParse(registrationId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(async ({ actor, db }) => {
    const invoice = issueRegistrationInvoice(db, actor, id.data);
    return { invoiceId: invoice.id, number: invoice.number, ...(await sendQuietly(db, actor, invoice.id)) };
  });
}

export async function issueSponsorInvoiceAction(sponsorId: number): Promise<ActionResult<IssueResult>> {
  const id = idSchema.safeParse(sponsorId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(async ({ actor, db }) => {
    const invoice = issueSponsorInvoice(db, actor, id.data);
    return { invoiceId: invoice.id, number: invoice.number, ...(await sendQuietly(db, actor, invoice.id)) };
  });
}

export async function sendInvoiceAction(invoiceId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(invoiceId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => sendInvoiceDocument(db, actor, id.data));
}

export async function recordPaymentAction(invoiceId: number, values: unknown): Promise<ActionResult<{ fullyPaid: boolean; openCents: number }>> {
  const id = idSchema.safeParse(invoiceId);
  const parsed = recordPaymentSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => {
    const r = recordBankTransfer(db, actor, id.data, { amountCents: parseEuroToCents(parsed.data.amount)!, paidOn: parsed.data.paidOn });
    return { fullyPaid: r.fullyPaid, openCents: r.openCents };
  });
}

export async function cancelInvoiceAction(invoiceId: number, values: unknown): Promise<ActionResult<IssueResult>> {
  const id = idSchema.safeParse(invoiceId);
  const parsed = cancelInvoiceSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(async ({ actor, db }) => {
    const credit = cancelInvoice(db, actor, id.data, parsed.data.reason);
    return { invoiceId: credit.id, number: credit.number, ...(await sendQuietly(db, actor, credit.id)) };
  });
}
