/** Formularschemas des Teilnehmerportals. */
import { z } from 'zod';

export const portalLoginSchema = z.object({ email: z.string().trim().max(200, 'tooLong').pipe(z.email('email')) });
export type PortalLoginValues = z.infer<typeof portalLoginSchema>;

const nameText = z.string().trim().min(1, 'required').max(100, 'tooLong');
export const ownPersonSchema = z.object({
  firstName: nameText,
  lastName: nameText,
  company: z.string().trim().max(200, 'tooLong'),
  phone: z.string().trim().max(50, 'tooLong'),
  locale: z.enum(['de', 'en'], 'required'),
});
export type OwnPersonValues = z.infer<typeof ownPersonSchema>;

export const portalCancelSchema = z.object({ reason: z.string().trim().max(500, 'tooLong') });
export type PortalCancelValues = z.infer<typeof portalCancelSchema>;
