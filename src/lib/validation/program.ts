/** Formularschemas für Speaker und Programmpunkte. */
import { z } from 'zod';
import { viennaInputToUtc } from '@/lib/dates';
import type { LocalizedText } from '@/lib/localized';
import { localizedTextSchema, optionalLocalizedTextSchema } from './forms';

const nameText = z.string().trim().min(1, 'required').max(100, 'tooLong');

export const speakerFormSchema = z.object({
  firstName: nameText,
  lastName: nameText,
  email: z.string().trim().max(200, 'tooLong').pipe(z.email('email')),
  company: z.string().trim().max(200, 'tooLong'),
  locale: z.enum(['de', 'en'], 'required'),
  proposalStatus: z.enum(['pending', 'confirmed', 'rejected'], 'required'),
  slidesStatus: z.enum(['missing', 'uploaded', 'review'], 'required'),
  /** Freigabelink zu den Folien (SharePoint, Nextcloud …), leer = keiner */
  slidesUrl: z
    .string()
    .trim()
    .max(1000, 'tooLong')
    .refine((v) => v === '' || /^https:\/\/[^\s]+$/i.test(v), 'httpsUrl'),
  /** Eventseite: Rolle und Kurzbio */
  role: z.string().trim().max(150, 'tooLong'),
  bio: optionalLocalizedTextSchema(2000),
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
  slidesUrl?: string | null;
  role?: string | null;
  bio?: LocalizedText | null;
};

export function toSpeakerInput(v: SpeakerFormValues): SpeakerInput {
  const de = v.bio.de.trim();
  const en = v.bio.en.trim();
  return {
    ...v,
    email: v.email.trim().toLowerCase(),
    company: v.company.trim() || null,
    slidesUrl: v.slidesUrl.trim() || null,
    role: v.role.trim() || null,
    bio: de || en ? (en ? { de: de || en, en } : { de }) : null,
  };
}

const localDateTime = z.string().refine((v) => viennaInputToUtc(v) !== null, 'dateTime');

export const SESSION_TAG_KEYS = ['general', 'talk', 'workshop', 'break'] as const;
const STREAM_PATTERN = /^(10|[1-9])$/;

export const sessionFormSchema = z
  .object({
    title: localizedTextSchema(200),
    startsAt: localDateTime,
    endsAt: localDateTime,
    location: z.string().trim().max(100, 'tooLong'),
    tag: z.enum(SESSION_TAG_KEYS, 'required'),
    /** erster und letzter Stream (Positionen 1–10); gleich = nur ein Stream */
    stream: z.string().regex(STREAM_PATTERN, 'required'),
    streamTo: z.string().regex(STREAM_PATTERN, 'required'),
    speakerId: z.string(),
    /** weitere Speaker (Co-Speaker) als IDs */
    coSpeakerIds: z.array(z.string().regex(/^\d+$/)).max(10),
  })
  .superRefine((v, ctx) => {
    const s = viennaInputToUtc(v.startsAt);
    const e = viennaInputToUtc(v.endsAt);
    if (s && e && e <= s) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'endBeforeStart' });
    if (Number(v.streamTo) < Number(v.stream)) ctx.addIssue({ code: 'custom', path: ['streamTo'], message: 'streamOrder' });
  });
export type SessionFormValues = z.infer<typeof sessionFormSchema>;

export type SessionInput = {
  title: LocalizedText;
  startsAt: string;
  endsAt: string;
  location: string;
  tag: (typeof SESSION_TAG_KEYS)[number];
  stream: number;
  /** letzter Stream; fehlt = nur `stream` */
  streamTo?: number;
  speakerId: number | null;
  /** weitere Speaker in dieser Reihenfolge; fehlt = keine */
  coSpeakerIds?: number[];
};

export function toSessionInput(v: SessionFormValues): SessionInput {
  return {
    title: v.title.en.trim() ? { de: v.title.de.trim(), en: v.title.en.trim() } : { de: v.title.de.trim() },
    startsAt: viennaInputToUtc(v.startsAt)!,
    endsAt: viennaInputToUtc(v.endsAt)!,
    location: v.location.trim(),
    tag: v.tag,
    stream: Number(v.stream),
    streamTo: Number(v.streamTo),
    speakerId: v.speakerId ? Number(v.speakerId) : null,
    coSpeakerIds: [...new Set(v.coSpeakerIds.map(Number))].filter((id) => id !== Number(v.speakerId)),
  };
}

export const streamFormSchema = z.object({ name: localizedTextSchema(60) });
export type StreamFormValues = z.infer<typeof streamFormSchema>;
