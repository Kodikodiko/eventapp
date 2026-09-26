import type { Locale } from '@/i18n/routing';

/** Mehrsprachiger Text: Deutsch ist Pflicht, Englisch optional (Fallback auf Deutsch). */
export type LocalizedText = { de: string; en?: string };

/** Mehrsprachige Liste, z. B. Leistungen eines Sponsorpakets. */
export type LocalizedList = { de: string[]; en?: string[] };

/** Liefert den Text in der gewünschten Sprache; fehlt Englisch (oder ist leer), wird Deutsch verwendet. */
export function localized(value: LocalizedText | null | undefined, locale: Locale): string {
  if (!value) return '';
  if (locale === 'en' && value.en && value.en.trim() !== '') return value.en;
  return value.de;
}

/** Wie {@link localized}, für Listen. */
export function localizedList(value: LocalizedList | null | undefined, locale: Locale): string[] {
  if (!value) return [];
  if (locale === 'en' && value.en && value.en.length > 0) return value.en;
  return value.de;
}
