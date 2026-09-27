/**
 * Formularschemas (Browser und Server): Werte kommen als Zeichenketten wie aus dem Formular.
 * Fehlermeldungen sind Schlüssel für messages → validation.*
 * toEventInput() & Co. wandeln geprüfte Formularwerte in Fachdaten (Cent, UTC).
 */
import { z } from 'zod';
import { viennaInputToUtc } from '@/lib/dates';
import type { LocalizedText } from '@/lib/localized';
import { parseEuroToCents } from '@/lib/money';

export const VAT_RATE_OPTIONS = ['0', '1000', '1300', '2000'] as const;

const requiredText = (max = 200) => z.string().trim().min(1, 'required').max(max, 'tooLong');
const optionalText = (max = 2000) => z.string().trim().max(max, 'tooLong');

export const localizedTextSchema = (max = 200) => z.object({ de: requiredText(max), en: optionalText(max) });
export const optionalLocalizedTextSchema = (max = 5000) => z.object({ de: optionalText(max), en: optionalText(max) });

const euroAmount = z.string().refine((v) => parseEuroToCents(v) !== null, 'amount');
const localDateTime = z.string().refine((v) => viennaInputToUtc(v) !== null, 'dateTime');
const optionalLocalDateTime = z.string().refine((v) => v.trim() === '' || viennaInputToUtc(v) !== null, 'dateTime');
const intInRange = (min: number, max: number) =>
  z.string().trim().regex(/^\d+$/, 'wholeNumber').refine((v) => Number(v) >= min && Number(v) <= max, 'outOfRange');

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const eventFormSchema = z
  .object({
    slug: z.string().trim().min(3, 'slugFormat').max(60, 'slugFormat').regex(SLUG_PATTERN, 'slugFormat'),
    name: localizedTextSchema(150),
    description: optionalLocalizedTextSchema(5000),
    location: optionalText(200),
    startsAt: localDateTime,
    endsAt: localDateTime,
    registrationOpensAt: optionalLocalDateTime,
    registrationClosesAt: optionalLocalDateTime,
    capacity: intInRange(0, 100000),
    priceNormal: euroAmount,
    priceMember: euroAmount,
    ticketVatRateBp: z.enum(VAT_RATE_OPTIONS, 'required'),
    allowStripe: z.boolean(),
    allowInvoice: z.boolean(),
    refundMode: z.enum(['automatic', 'approval'], 'required'),
    cancellationRules: z
      .array(z.object({ daysBeforeEvent: intInRange(0, 365), refundPercent: intInRange(0, 100) }))
      .max(10, 'tooMany'),
  })
  .superRefine((v, ctx) => {
    const starts = viennaInputToUtc(v.startsAt);
    const ends = viennaInputToUtc(v.endsAt);
    if (starts && ends && ends <= starts) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endBeforeStart' });
    const opens = viennaInputToUtc(v.registrationOpensAt);
    const closes = viennaInputToUtc(v.registrationClosesAt);
    if (opens && closes && closes <= opens) {
      ctx.addIssue({ code: 'custom', path: ['registrationClosesAt'], message: 'closeBeforeOpen' });
    }
    if (closes && ends && closes > ends) {
      ctx.addIssue({ code: 'custom', path: ['registrationClosesAt'], message: 'closeAfterEvent' });
    }
    const normal = parseEuroToCents(v.priceNormal) ?? 0;
    const member = parseEuroToCents(v.priceMember) ?? 0;
    if ((normal > 0 || member > 0) && !v.allowStripe && !v.allowInvoice) {
      ctx.addIssue({ code: 'custom', path: ['allowStripe'], message: 'paymentMethodRequired' });
    }
    const seen = new Set<string>();
    v.cancellationRules.forEach((rule, i) => {
      const key = String(Number(rule.daysBeforeEvent));
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['cancellationRules', i, 'daysBeforeEvent'], message: 'duplicateDays' });
      }
      seen.add(key);
    });
  });

export type EventFormValues = z.infer<typeof eventFormSchema>;

export type CancellationRuleInput = { daysBeforeEvent: number; refundPercent: number };

export type EventInput = {
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  location: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  capacity: number;
  priceNormalCents: number;
  priceMemberCents: number;
  ticketVatRateBp: number;
  allowStripe: boolean;
  allowInvoice: boolean;
  refundMode: 'automatic' | 'approval';
  cancellationRules: CancellationRuleInput[];
};

function cleanLocalized(v: { de: string; en: string }): LocalizedText {
  return v.en.trim() ? { de: v.de.trim(), en: v.en.trim() } : { de: v.de.trim() };
}

/** Geprüfte Formularwerte → Fachdaten. Voraussetzung: eventFormSchema.parse war erfolgreich. */
export function toEventInput(v: EventFormValues): EventInput {
  return {
    slug: v.slug.trim(),
    name: cleanLocalized(v.name),
    description: v.description.de.trim() || v.description.en.trim() ? cleanLocalized(v.description) : null,
    location: v.location.trim(),
    startsAt: viennaInputToUtc(v.startsAt)!,
    endsAt: viennaInputToUtc(v.endsAt)!,
    registrationOpensAt: viennaInputToUtc(v.registrationOpensAt),
    registrationClosesAt: viennaInputToUtc(v.registrationClosesAt),
    capacity: Number(v.capacity),
    priceNormalCents: parseEuroToCents(v.priceNormal)!,
    priceMemberCents: parseEuroToCents(v.priceMember)!,
    ticketVatRateBp: Number(v.ticketVatRateBp),
    allowStripe: v.allowStripe,
    allowInvoice: v.allowInvoice,
    refundMode: v.refundMode,
    cancellationRules: v.cancellationRules
      .map((r) => ({ daysBeforeEvent: Number(r.daysBeforeEvent), refundPercent: Number(r.refundPercent) }))
      .sort((a, b) => b.daysBeforeEvent - a.daysBeforeEvent),
  };
}

export const copyEventSchema = z.object({
  slug: z.string().trim().min(3, 'slugFormat').max(60, 'slugFormat').regex(SLUG_PATTERN, 'slugFormat'),
  name: localizedTextSchema(150),
});
export type CopyEventValues = z.infer<typeof copyEventSchema>;

export const organizerFormSchema = z.object({
  name: requiredText(200),
  address: z.string().trim().min(1, 'required').max(500, 'tooLong'),
  vatId: optionalText(30),
  iban: optionalText(40),
  bic: optionalText(15),
  contactEmail: z.string().trim().max(200, 'tooLong').refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'email'),
  vatMode: z.enum(['small_business', 'standard'], 'required'),
  smallBusinessNote: optionalLocalizedTextSchema(300),
  invoicePaymentTermDays: intInRange(0, 120),
});
export type OrganizerFormValues = z.infer<typeof organizerFormSchema>;

export const legalDocumentFormSchema = z.object({
  content: localizedTextSchema(50000),
});
export type LegalDocumentFormValues = z.infer<typeof legalDocumentFormSchema>;
