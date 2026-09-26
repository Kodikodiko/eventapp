import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { routing, type Locale } from './routing';

export type LocaleParams = { params: Promise<{ locale: string }> };

/**
 * Für Seiten und Layouts unter [locale]: prüft die Sprache, aktiviert statisches Rendering
 * und gibt die typisierte Sprache zurück.
 */
export async function initLocale(params: LocaleParams['params']): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
