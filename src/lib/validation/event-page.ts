/** Formular „Eventseite“: Motto, Farben, Logo, Titelbild und Nutzen-Blöcke (höchstens drei, je mit Icon). */
import { z } from 'zod';
import type { EventHighlight, EventTheme, LocalizedText } from '@/lib/localized';
import { optionalLocalizedTextSchema } from './forms';

export const MAX_HIGHLIGHTS = 3;

export const THEME_KEYS = ['primary', 'dark', 'accent', 'surface'] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;
const colorSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || HEX.test(v), { message: 'color' });

export const eventPageFormSchema = z.object({
  tagline: optionalLocalizedTextSchema(150),
  theme: z.object({ primary: colorSchema, dark: colorSchema, accent: colorSchema, surface: colorSchema }),
  highlights: z
    .array(
      z.object({
        title: optionalLocalizedTextSchema(80),
        text: optionalLocalizedTextSchema(400),
        /** vorhandenes Icon behalten (Pfad wie gespeichert) oder null = keins */
        iconPath: z.string().max(80).nullable(),
      })
    )
    .max(MAX_HIGHLIGHTS),
  removeHero: z.boolean(),
  removeLogo: z.boolean(),
});
export type EventPageFormValues = z.infer<typeof eventPageFormSchema>;

export type EventPageInput = { tagline: LocalizedText | null; highlights: EventHighlight[]; theme?: EventTheme | null };

const clean = (v: { de: string; en: string }): LocalizedText | null => {
  const de = v.de.trim();
  const en = v.en.trim();
  if (!de && !en) return null;
  return en ? { de: de || en, en } : { de };
};

/** Formular-Positionen der Nutzen-Blöcke, die gespeichert werden (leere ohne Titel entfallen). */
export function keptHighlightSlots(v: EventPageFormValues): number[] {
  return v.highlights.flatMap((h, i) => (clean(h.title) ? [i] : []));
}

function toTheme(v: EventPageFormValues['theme']): EventTheme | null {
  const theme: EventTheme = {};
  for (const key of THEME_KEYS) if (v[key]) theme[key] = v[key].toUpperCase();
  return Object.keys(theme).length ? theme : null;
}

export function toEventPageInput(v: EventPageFormValues): EventPageInput {
  return {
    tagline: clean(v.tagline),
    theme: toTheme(v.theme),
    highlights: keptHighlightSlots(v).map((i) => {
      const h = v.highlights[i];
      return { title: clean(h.title)!, text: clean(h.text) ?? { de: '' }, iconPath: h.iconPath };
    }),
  };
}

export function toEventPageFormValues(v: EventPageInput): EventPageFormValues {
  const form = (t: LocalizedText | null | undefined) => ({ de: t?.de ?? '', en: t?.en ?? '' });
  return {
    tagline: form(v.tagline),
    theme: { primary: v.theme?.primary ?? '', dark: v.theme?.dark ?? '', accent: v.theme?.accent ?? '', surface: v.theme?.surface ?? '' },
    highlights: Array.from({ length: MAX_HIGHLIGHTS }, (_, i) => ({
      title: form(v.highlights[i]?.title),
      text: form(v.highlights[i]?.text),
      iconPath: v.highlights[i]?.iconPath ?? null,
    })),
    removeHero: false,
    removeLogo: false,
  };
}
