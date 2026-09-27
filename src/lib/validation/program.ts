/** Formularschemas für Speaker und Programmpunkte. */
import { z } from 'zod';
import { viennaInputToUtc } from '@/lib/dates';
import type { LocalizedText } from '@/lib/localized';
import { localizedTextSchema } from './forms';

const nameText = z.string().trim().min(1, 'required').max(100, 'tooLong');

export const speakerFormSchema = z.object({
  firstName: nameText,
  lastName: nameText,
  email: z.string().trim().max(200, 'tooLong').pipe(z.email('email')),
  company: z.string().trim().max(200, 'tooLong'),
  locale: z.enum(['de', 'en'], 'required'),
  proposalStatus: z.enum(['pending', 'confirmed', 'rejected'], 'required'),
  slidesStatus: z.enum(['missing', 'uploaded', 'review'], 'required'),
});
export type SpeakerFormValues = z.infer<typeof speakerFormSchema>;

export type SpeakerInput = {
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  locale: 'de' | 'en';
  proposalStatus: 'pending' | 'confirmed' | 'rejected';
  slidesStatus: 'missing' | 'uploaded' | 'review';
};

export function toSpeakerInput(v: SpeakerFormValues): SpeakerInput {
  return { ...v, email: v.email.trim().toLowerCase(), company: v.company.trim() || null };
}

const localDateTime = z.string().refine((v) => viennaInputToUtc(v) !== null, 'dateTime');

export const SESSION_TAG_KEYS = ['general', 'talk', 'workshop', 'break'] as const;

export const sessionFormSchema = z
  .object({
    title: localizedTextSchema(200),
    startsAt: localDateTime,
    endsAt: localDateTime,
    location: z.string().trim().max(100, 'tooLong'),
    tag: z.enum(SESSION_TAG_KEYS, 'required'),
    stream: z.enum(['1', '2', '3', '4'], 'required'),
    speakerId: z.string(),
  })
  .superRefine((v, ctx) => {
    const s = viennaInputToUtc(v.startsAt);
    const e = viennaInputToUtc(v.endsAt);
    if (s && e && e <= s) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endBeforeStart' });
  });
export type SessionFormValues = z.infer<typeof sessionFormSchema>;

export type SessionInput = {
  title: LocalizedText;
  startsAt: string;
  endsAt: string;
  location: string;
  tag: (typeof SESSION_TAG_KEYS)[number];
  stream: number;
  speakerId: number | null;
};

export function toSessionInput(v: SessionFormValues): SessionInput {
  return {
    title: v.title.en.trim() ? { de: v.title.de.trim(), en: v.title.en.trim() } : { de: v.title.de.trim() },
    startsAt: viennaInputToUtc(v.startsAt)!,
    endsAt: viennaInputToUtc(v.endsAt)!,
    location: v.location.trim(),
    tag: v.tag,
    stream: Number(v.stream),
    speakerId: v.speakerId ? Number(v.speakerId) : null,
  };
}
