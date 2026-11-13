/** Formularschema für den Plan der Erfolgsrechnung (je Variante). */
import { z } from 'zod';
import { parseEuroToCents } from '@/lib/money';

export const PLAN_VARIANT_KEYS = ['plan', 'min', 'best'] as const;
export type PlanVariant = (typeof PLAN_VARIANT_KEYS)[number];

export const PLAN_TICKET_KEYS = ['normal', 'member', 'special', 'free'] as const;
export type PlanTicketKey = (typeof PLAN_TICKET_KEYS)[number];
export const PLAN_PRICE_KEYS = ['normal', 'member', 'special'] as const;
export type PlanPriceKey = (typeof PLAN_PRICE_KEYS)[number];

export const MAX_COMPARE_EVENTS = 2;

/** leer = 0 */
const count = z.string().trim().regex(/^\d{0,5}$/, 'wholeNumber');
/** leer = keine Angabe */
const optionalAmount = z.string().trim().refine((v) => v === '' || parseEuroToCents(v) !== null, 'amount');

export const planFormSchema = z.object({
  tickets: z.object({ normal: count, member: count, special: count, free: count }),
  prices: z.object({ normal: optionalAmount, member: optionalAmount, special: optionalAmount }),
  sponsorIncome: optionalAmount,
  /** Kostengruppen-ID → Budget */
  budgets: z.record(z.string().regex(/^\d+$/), optionalAmount),
});
export type PlanFormValues = z.infer<typeof planFormSchema>;

export type PlanInput = {
  tickets: Record<PlanTicketKey, number>;
  /** null = Preis des Events (Sonderpreis: 0) */
  prices: Record<PlanPriceKey, number | null>;
  sponsorIncomeCents: number;
  /** nur Kostengruppen mit Angabe */
  budgets: { costGroupId: number; amountCents: number }[];
};

const cents = (v: string) => (v.trim() === '' ? null : parseEuroToCents(v));

export function toPlanInput(v: PlanFormValues): PlanInput {
  return {
    tickets: {
      normal: Number(v.tickets.normal || 0),
      member: Number(v.tickets.member || 0),
      special: Number(v.tickets.special || 0),
      free: Number(v.tickets.free || 0),
    },
    prices: { normal: cents(v.prices.normal), member: cents(v.prices.member), special: cents(v.prices.special) },
    sponsorIncomeCents: cents(v.sponsorIncome) ?? 0,
    budgets: Object.entries(v.budgets)
      .map(([id, amount]) => ({ costGroupId: Number(id), amountCents: cents(amount) }))
      .filter((b): b is { costGroupId: number; amountCents: number } => b.amountCents !== null),
  };
}
