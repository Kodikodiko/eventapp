import type { Locale } from '@/i18n/routing';

/** Mehrsprachiger Text: Deutsch ist Pflicht, Englisch optional (Fallback auf Deutsch). */
export type LocalizedText = { de: string; en?: string };

/** Mehrsprachige Liste, z. B. Leistungen eines Sponsorpakets. */
export type LocalizedList = { de: string[]; en?: string[] };

/** Nutzen-Block der Eventseite: kurzer Titel, Text und optional ein Icon (Pfad unter MEDIA_DIR) */
export type EventHighlight = { title: LocalizedText; text: LocalizedText; iconPath?: string | null };

/** Farben der öffentlichen Eventseite (Hex, z. B. „#4F17A8“); fehlende Farben nehmen die EventFlow-Standardfarben. */
export type EventTheme = {
  /** Hauptfarbe: Programm-Zeiten, Sponsoren-Bereich, hervorgehobener Preis */
  primary?: string;
  /** Dunkle Fläche: Einleitung unter dem Kopfbereich */
  dark?: string;
  /** Buttons und Links */
  accent?: string;
  /** Helle Fläche: Programm und Speaker */
  surface?: string;
};

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
