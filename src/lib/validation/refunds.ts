/** Formularschemas zu Erstattungen (Admin-Bereich). */
import { z } from 'zod';
import { parseEuroToCents } from '@/lib/money';

const euro = z.string().refine((v) => (parseEuroToCents(v) ?? 0) > 0, 'amount');

export const manualRefundSchema = z.object({ amount: euro, reason: z.string().trim().min(1, 'required').max(500, 'tooLong') });
export type ManualRefundValues = z.infer<typeof manualRefundSchema>;

export const approveRefundSchema = z.object({ amount: euro });
export type ApproveRefundValues = z.infer<typeof approveRefundSchema>;

export const rejectRefundSchema = z.object({ note: z.string().trim().min(1, 'required').max(500, 'tooLong') });
export type RejectRefundValues = z.infer<typeof rejectRefundSchema>;

export const refundTransferSchema = z.object({ transferredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date') });
export type RefundTransferValues = z.infer<typeof refundTransferSchema>;
