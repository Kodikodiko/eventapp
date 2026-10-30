/** Formularschemas zu Erstattungen (Admin-Bereich). */
import { z } from 'zod';
import { parseEuroToCents } from '@/lib/money';

const euro = z.string().refine((v) => (parseEuroToCents(v) ?? 0) > 0, 'amount');

const reason = z.string().trim().min(1, 'required').max(500, 'tooLong');

export const manualRefundSchema = z.object({
  amount: euro,
  reason,
  /** Überweisung schon zurückgezahlt → sofort verbuchen */
  transferDone: z.boolean(),
});
export type ManualRefundValues = z.infer<typeof manualRefundSchema>;

export const approveRefundSchema = z.object({ amount: euro });
export type ApproveRefundValues = z.infer<typeof approveRefundSchema>;

export const rejectRefundSchema = z.object({ note: z.string().trim().min(1, 'required').max(500, 'tooLong') });
export type RejectRefundValues = z.infer<typeof rejectRefundSchema>;

export const refundTransferSchema = z.object({ transferredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date') });
export type RefundTransferValues = z.infer<typeof refundTransferSchema>;

/** Sammel-Erstattung aus der Teilnehmerliste (Vorschau und Ausführung mit denselben Werten). */
export const bulkRefundSchema = z.object({
  cancel: z.boolean(),
  mode: z.enum(['rules', 'percent']),
  percent: z.string().trim().regex(/^(100|\d{1,2})$/, 'percent'),
  reason,
  notify: z.boolean(),
  transferDone: z.boolean(),
});
export type BulkRefundValues = z.infer<typeof bulkRefundSchema>;
