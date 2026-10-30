/** Formularschemas für Kostengruppen und Ausgaben. */
import { z } from 'zod';
import { parseEuroToCents } from '@/lib/money';
import { VAT_RATE_OPTIONS } from './forms';

export const EXPENSE_STATUS_KEYS = ['new', 'planned', 'paid'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUS_KEYS)[number];

/** Belege: erlaubte Dateiendungen mit dem Medientyp, mit dem sie ausgeliefert werden. */
export const RECEIPT_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;
export const RECEIPT_ACCEPT = Object.keys(RECEIPT_TYPES).map((ext) => `.${ext}`).join(',');
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Dateiendung eines erlaubten Belegs oder null. */
export function receiptExtension(fileName: string): keyof typeof RECEIPT_TYPES | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ext in RECEIPT_TYPES ? (ext as keyof typeof RECEIPT_TYPES) : null;
}

export const costGroupFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(60, 'tooLong'),
  speakerLink: z.boolean(),
});
export type CostGroupFormValues = z.infer<typeof costGroupFormSchema>;
export type CostGroupInput = { name: string; speakerLink: boolean };

export function toCostGroupInput(v: CostGroupFormValues): CostGroupInput {
  return { name: v.name.trim().replace(/\s+/g, ' '), speakerLink: v.speakerLink };
}

/** Vergleichsschlüssel für „keine doppelten Namen“ (ohne Groß-/Kleinschreibung und Mehrfach-Leerzeichen). */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}

export const expenseFormSchema = z.object({
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date'),
  amount: z.string().refine((v) => (parseEuroToCents(v) ?? 0) > 0, 'amountPositive'),
  /** leer = keine Angabe (Kleinunternehmer) */
  vatRateBp: z.enum(['', ...VAT_RATE_OPTIONS], 'required'),
  costGroupId: z.string().regex(/^\d+$/, 'required'),
  status: z.enum(EXPENSE_STATUS_KEYS, 'required'),
  supplier: z.string().trim().max(200, 'tooLong'),
  description: z.string().trim().min(1, 'required').max(500, 'tooLong'),
  speakerId: z.string().regex(/^\d*$/, 'invalid'),
  removeReceipt: z.boolean(),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export type ExpenseInput = {
  spentOn: string;
  amountCents: number;
  vatRateBp: number | null;
  costGroupId: number;
  status: ExpenseStatus;
  supplier: string | null;
  description: string;
  speakerId: number | null;
};

export function toExpenseInput(v: ExpenseFormValues): ExpenseInput {
  return {
    spentOn: v.spentOn,
    amountCents: parseEuroToCents(v.amount)!,
    vatRateBp: v.vatRateBp === '' ? null : Number(v.vatRateBp),
    costGroupId: Number(v.costGroupId),
    status: v.status,
    supplier: v.supplier.trim() || null,
    description: v.description.trim(),
    speakerId: v.speakerId ? Number(v.speakerId) : null,
  };
}
