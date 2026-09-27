/** Formularschemas rund um Rechnungen (Admin-Bereich). */
import { z } from 'zod';
import { parseEuroToCents } from '@/lib/money';

export const recordPaymentSchema = z.object({
  amount: z.string().refine((v) => (parseEuroToCents(v) ?? 0) > 0, 'amount'),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date'),
});
export type RecordPaymentValues = z.infer<typeof recordPaymentSchema>;

export const cancelInvoiceSchema = z.object({ reason: z.string().trim().min(1, 'required').max(500, 'tooLong') });
export type CancelInvoiceValues = z.infer<typeof cancelInvoiceSchema>;
