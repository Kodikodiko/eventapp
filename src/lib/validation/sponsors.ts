/** Formularschemas für Sponsorpakete und Sponsoren. */
import { z } from 'zod';
import type { LocalizedList, LocalizedText } from '@/lib/localized';
import { parseEuroToCents } from '@/lib/money';
import { localizedTextSchema, VAT_RATE_OPTIONS } from './forms';

const euro = z.string().refine((v) => parseEuroToCents(v) !== null, 'amount');
const optionalText = (max: number) => z.string().trim().max(max, 'tooLong');

export const packageFormSchema = z.object({
  name: localizedTextSchema(100),
  /** eine Leistung pro Zeile */
  benefits: z.object({ de: optionalText(3000), en: optionalText(3000) }),
  price: euro,
  vatRateBp: z.enum(VAT_RATE_OPTIONS, 'required'),
  sortOrder: z.string().trim().regex(/^\d{1,3}$/, 'wholeNumber'),
});
export type PackageFormValues = z.infer<typeof packageFormSchema>;

export type PackageInput = {
  name: LocalizedText;
  benefits: LocalizedList;
  priceCents: number;
  vatRateBp: number;
  sortOrder: number;
};

const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function toPackageInput(v: PackageFormValues): PackageInput {
  const en = lines(v.benefits.en);
  return {
    name: v.name.en.trim() ? { de: v.name.de.trim(), en: v.name.en.trim() } : { de: v.name.de.trim() },
    benefits: en.length ? { de: lines(v.benefits.de), en } : { de: lines(v.benefits.de) },
    priceCents: parseEuroToCents(v.price)!,
    vatRateBp: Number(v.vatRateBp),
    sortOrder: Number(v.sortOrder),
  };
}

export const SPONSOR_PAYMENT_STATUS_KEYS = ['open', 'invoiced', 'paid', 'overdue'] as const;

const contactSchema = z.object({
  firstName: z.string().trim().min(1, 'required').max(100, 'tooLong'),
  lastName: z.string().trim().min(1, 'required').max(100, 'tooLong'),
  email: z.string().trim().max(200, 'tooLong').pipe(z.email('email')),
  phone: optionalText(50),
  function: optionalText(100),
  locale: z.enum(['de', 'en'], 'required'),
});

export const sponsorFormSchema = z.object({
  companyName: z.string().trim().min(1, 'required').max(200, 'tooLong'),
  packageId: z.string(),
  discount: euro,
  dueOn: z.string().refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'date'),
  paymentStatus: z.enum(SPONSOR_PAYMENT_STATUS_KEYS, 'required'),
  billingAddress: optionalText(500),
  notes: optionalText(2000),
  contacts: z
    .array(contactSchema)
    .min(1, 'contactRequired')
    .max(10, 'tooMany')
    .superRefine((contacts, ctx) => {
      const seen = new Set<string>();
      contacts.forEach((c, i) => {
        const key = c.email.trim().toLowerCase();
        if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [i, 'email'], message: 'duplicateContact' });
        seen.add(key);
      });
    }),
});
export type SponsorFormValues = z.infer<typeof sponsorFormSchema>;

export type SponsorContactInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  function: string | null;
  locale: 'de' | 'en';
};

export type SponsorInput = {
  companyName: string;
  packageId: number | null;
  discountCents: number;
  dueOn: string | null;
  paymentStatus: (typeof SPONSOR_PAYMENT_STATUS_KEYS)[number];
  billingAddress: string;
  notes: string | null;
  contacts: SponsorContactInput[];
};

export function toSponsorInput(v: SponsorFormValues): SponsorInput {
  return {
    companyName: v.companyName.trim(),
    packageId: v.packageId ? Number(v.packageId) : null,
    discountCents: parseEuroToCents(v.discount)!,
    dueOn: v.dueOn || null,
    paymentStatus: v.paymentStatus,
    billingAddress: v.billingAddress.trim(),
    notes: v.notes.trim() || null,
    contacts: v.contacts.map((c) => ({
      firstName: c.firstName.trim(),
      lastName: c.lastName.trim(),
      email: c.email.trim().toLowerCase(),
      phone: c.phone.trim() || null,
      function: c.function.trim() || null,
      locale: c.locale,
    })),
  };
}
