/** Formularschemas für Sonderpreis-Kategorien und Rabattcodes. */
import { z } from 'zod';
import { viennaInputToUtc } from '@/lib/dates';
import { parseEuroToCents } from '@/lib/money';
import { CODE_PATTERN, normalizeCode, type DiscountKind } from '@/lib/pricing';

const euro = z.string().refine((v) => parseEuroToCents(v) !== null, 'amount');
const optionalLocalDateTime = z.string().refine((v) => v.trim() === '' || viennaInputToUtc(v) !== null, 'dateTime');

export const priceCategoryFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(100, 'tooLong'),
  price: euro,
  active: z.boolean(),
});
export type PriceCategoryFormValues = z.infer<typeof priceCategoryFormSchema>;
export type PriceCategoryInput = { name: string; priceCents: number; active: boolean };

export function toPriceCategoryInput(v: PriceCategoryFormValues): PriceCategoryInput {
  return { name: v.name.trim(), priceCents: parseEuroToCents(v.price)!, active: v.active };
}

/** Prozent mit höchstens zwei Nachkommastellen, 0 < p ≤ 100 → Basispunkte */
export function parsePercentToBp(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bp = Math.round(Number(s) * 100);
  return bp > 0 && bp <= 10000 ? bp : null;
}

export const discountCodeFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .refine((v) => CODE_PATTERN.test(normalizeCode(v)), 'codeFormat'),
    kind: z.enum(['fixed', 'percent'], 'required'),
    /** Euro-Betrag bzw. Prozent als Text */
    value: z.string().trim().min(1, 'required'),
    validFrom: optionalLocalDateTime,
    validUntil: optionalLocalDateTime,
    maxUses: z.string().trim().refine((v) => v === '' || (/^\d{1,6}$/.test(v) && Number(v) > 0), 'wholeNumber'),
    active: z.boolean(),
    note: z.string().trim().max(500, 'tooLong'),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'percent' && parsePercentToBp(v.value) === null) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'percent' });
    }
    if (v.kind === 'fixed') {
      const cents = parseEuroToCents(v.value);
      if (cents === null || cents <= 0) ctx.addIssue({ code: 'custom', path: ['value'], message: 'amount' });
    }
    const from = viennaInputToUtc(v.validFrom);
    const until = viennaInputToUtc(v.validUntil);
    if (from && until && until <= from) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'closeBeforeOpen' });
  });
export type DiscountCodeFormValues = z.infer<typeof discountCodeFormSchema>;

export type DiscountCodeInput = {
  code: string;
  kind: DiscountKind;
  value: number;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  active: boolean;
  note: string | null;
};

export function toDiscountCodeInput(v: DiscountCodeFormValues): DiscountCodeInput {
  return {
    code: normalizeCode(v.code),
    kind: v.kind,
    value: v.kind === 'percent' ? parsePercentToBp(v.value)! : parseEuroToCents(v.value)!,
    validFrom: viennaInputToUtc(v.validFrom),
    validUntil: viennaInputToUtc(v.validUntil),
    maxUses: v.maxUses ? Number(v.maxUses) : null,
    active: v.active,
    note: v.note || null,
  };
}
