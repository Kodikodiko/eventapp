import { z } from 'zod';
import type { LocalizedText } from '@/lib/localized';
import { localizedTextSchema } from './forms';

/** Hintergrundbild der Teilnahmebestätigung: PNG oder JPG, höchstens 5 MB (A4 quer empfohlen). */
export const CERTIFICATE_IMAGE_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' } as const;
export const CERTIFICATE_IMAGE_ACCEPT = Object.keys(CERTIFICATE_IMAGE_TYPES).map((ext) => `.${ext}`).join(',');
export const MAX_CERTIFICATE_IMAGE_BYTES = 5 * 1024 * 1024;

export function certificateImageExtension(fileName: string): keyof typeof CERTIFICATE_IMAGE_TYPES | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  return ext in CERTIFICATE_IMAGE_TYPES ? (ext as keyof typeof CERTIFICATE_IMAGE_TYPES) : null;
}

export const DEFAULT_CERTIFICATE_HEADING: LocalizedText = { de: 'Teilnahmebestätigung', en: 'Certificate of Attendance' };
export const DEFAULT_CERTIFICATE_BODY: LocalizedText = {
  de: '{name}\nhat an der Veranstaltung\n{event}\nam {datum} von {uhrzeit} in {ort} teilgenommen.',
  en: '{name}\nattended the event\n{event}\non {datum}, {uhrzeit}, in {ort}.',
};
export const DEFAULT_CERTIFICATE_COLOR = '#1a1a1a';

export const certificateFormSchema = z.object({
  heading: localizedTextSchema(100),
  body: localizedTextSchema(1000),
  textColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'invalid'),
  removeImage: z.boolean(),
});
export type CertificateFormValues = z.infer<typeof certificateFormSchema>;

export type CertificateInput = { heading: LocalizedText; body: LocalizedText; textColor: string };

export function toCertificateInput(v: CertificateFormValues): CertificateInput {
  const en = (s: string) => (s.trim() ? { en: s.trim() } : {});
  return {
    heading: { de: v.heading.de.trim(), ...en(v.heading.en) },
    body: { de: v.body.de.trim(), ...en(v.body.en) },
    textColor: v.textColor.toLowerCase(),
  };
}

export type CertificateValues = { name: string; event: string; datum: string; uhrzeit: string; ort: string };

/** Setzt die Platzhalter ein: {name}, {event}, {datum} bzw. {date}, {uhrzeit} bzw. {zeit}/{time}, {ort} bzw. {location}. Unbekannte bleiben stehen. */
export function fillCertificateText(text: string, v: CertificateValues): string {
  const map: Record<string, string> = { name: v.name, event: v.event, datum: v.datum, date: v.datum, uhrzeit: v.uhrzeit, zeit: v.uhrzeit, time: v.uhrzeit, ort: v.ort, location: v.ort };
  return text.replace(/\{(\w+)\}/g, (all, key: string) => map[key.toLowerCase()] ?? all);
}
