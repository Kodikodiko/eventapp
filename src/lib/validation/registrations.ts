/** Formularschemas für Anmeldungen im Admin-Bereich (Werte als Zeichenketten wie aus dem Formular). */
import { z } from 'zod';
import { parseEuroToCents } from '@/lib/money';

const optionalText = (max: number) => z.string().trim().max(max, 'tooLong');
const nameText = z.string().trim().min(1, 'required').max(100, 'tooLong');

const base = {
  firstName: nameText,
  lastName: nameText,
  email: z.string().trim().max(200, 'tooLong').pipe(z.email('email')),
  company: optionalText(200),
  locale: z.enum(['de', 'en'], 'required'),
  roles: z.array(z.string()).min(1, 'roleRequired'),
  ticketType: z.enum(['normal', 'member'], 'required'),
  price: z.string().refine((v) => parseEuroToCents(v) !== null, 'amount'),
  billingCompany: optionalText(200),
  billingAddress: optionalText(500),
};

export const registrationCreateSchema = z.object({
  ...base,
  status: z.enum(['confirmed', 'waitlisted'], 'required'),
  overbook: z.boolean(),
  /** Bestätigung per E-Mail senden (bei Preis > 0 mit Rechnung im Anhang) */
  notify: z.boolean(),
});
export type RegistrationCreateValues = z.infer<typeof registrationCreateSchema>;

export const registrationUpdateSchema = z.object(base);
export type RegistrationUpdateValues = z.infer<typeof registrationUpdateSchema>;

export const cancelSchema = z.object({ reason: z.string().trim().min(1, 'required').max(500, 'tooLong') });
export type CancelValues = z.infer<typeof cancelSchema>;

export type RegistrationPersonInput = {
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  locale: 'de' | 'en';
};

export type RegistrationAdminInput = RegistrationPersonInput & {
  roles: string[];
  ticketType: 'normal' | 'member';
  priceCents: number;
  billingCompany: string | null;
  billingAddress: string | null;
};

const orNull = (v: string) => (v.trim() ? v.trim() : null);

export function toRegistrationInput(v: RegistrationUpdateValues): RegistrationAdminInput {
  return {
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    email: v.email.trim().toLowerCase(),
    company: orNull(v.company),
    locale: v.locale,
    roles: [...new Set(v.roles)],
    ticketType: v.ticketType,
    priceCents: parseEuroToCents(v.price)!,
    billingCompany: orNull(v.billingCompany),
    billingAddress: orNull(v.billingAddress),
  };
}
