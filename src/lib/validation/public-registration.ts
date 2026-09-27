/** Formular der öffentlichen Anmeldung. Preis und Berechtigung bestimmt ausschließlich der Server. */
import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max, 'tooLong');
const required = (max: number) => z.string().trim().min(1, 'required').max(max, 'tooLong');

export const PUBLIC_PAYMENT_METHODS = ['stripe', 'invoice'] as const;
export type PublicPaymentMethod = (typeof PUBLIC_PAYMENT_METHODS)[number];

export const publicRegistrationSchema = z
  .object({
    firstName: required(100),
    lastName: required(100),
    email: z.string().trim().max(200, 'tooLong').pipe(z.email('email')),
    company: text(200),
    memberNumber: text(50),
    /** leer, wenn das Ticket kostenlos ist */
    paymentMethod: z.enum([...PUBLIC_PAYMENT_METHODS, ''], 'required'),
    billingCompany: text(200),
    billingAddress: text(500),
    acceptTerms: z.boolean().refine((v) => v, 'termsRequired'),
    acceptPrivacy: z.boolean().refine((v) => v, 'privacyRequired'),
    photoConsent: z.boolean(),
    newsletter: z.boolean(),
    /** Honeypot – für Menschen unsichtbar, muss leer bleiben */
    website: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.paymentMethod !== 'invoice') return;
    if (!v.billingCompany) ctx.addIssue({ code: 'custom', path: ['billingCompany'], message: 'requiredForInvoice' });
    if (!v.billingAddress) ctx.addIssue({ code: 'custom', path: ['billingAddress'], message: 'requiredForInvoice' });
  });
export type PublicRegistrationValues = z.infer<typeof publicRegistrationSchema>;

/** Angaben, die das Formular zusätzlich mitschickt: welche Fassung von AGB/Datenschutz und welcher Preis angezeigt wurden. */
export const publicRegistrationMetaSchema = z.object({
  eventId: z.number().int().positive(),
  termsDocumentId: z.number().int().positive(),
  privacyDocumentId: z.number().int().positive(),
  expectedPriceCents: z.number().int().min(0),
  locale: z.enum(['de', 'en']),
});
export type PublicRegistrationMeta = z.infer<typeof publicRegistrationMetaSchema>;

export type PublicRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  locale: 'de' | 'en';
  memberNumber: string | null;
  paymentMethod: PublicPaymentMethod | null;
  billingCompany: string | null;
  billingAddress: string | null;
  photoConsent: boolean;
  newsletter: boolean;
  termsDocumentId: number;
  privacyDocumentId: number;
  expectedPriceCents: number;
};

export function toPublicRegistrationInput(v: PublicRegistrationValues, meta: PublicRegistrationMeta): PublicRegistrationInput {
  const invoice = v.paymentMethod === 'invoice';
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    email: v.email.toLowerCase(),
    company: v.company || null,
    locale: meta.locale,
    memberNumber: v.memberNumber || null,
    paymentMethod: v.paymentMethod || null,
    billingCompany: invoice ? v.billingCompany : null,
    billingAddress: invoice ? v.billingAddress : null,
    photoConsent: v.photoConsent,
    newsletter: v.newsletter,
    termsDocumentId: meta.termsDocumentId,
    privacyDocumentId: meta.privacyDocumentId,
    expectedPriceCents: meta.expectedPriceCents,
  };
}
