/**
 * Geldbeträge: intern immer ganze Cent (number, ganzzahlig). Umrechnung und Formatierung nur hier.
 * Steuersätze in Basispunkten: 2000 = 20 %, 1000 = 10 %, 0 = steuerfrei.
 */
import type { Locale } from '@/i18n/routing';

const INTL_LOCALE: Record<Locale, string> = { de: 'de-AT', en: 'en-GB' };

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error(`Ungültiger Centbetrag: ${value}`);
}

/** Formatiert Cent als Euro-Betrag, z. B. 14900 → „€ 149,00“ (de) bzw. „€149.00“ (en). */
export function formatEuro(cents: number, locale: Locale): string {
  assertCents(cents);
  return new Intl.NumberFormat(INTL_LOCALE[locale], { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/**
 * Liest eine Eingabe in Euro (Komma oder Punkt als Dezimaltrennzeichen, Tausenderpunkte erlaubt)
 * und liefert Cent. Gibt null zurück, wenn die Eingabe kein gültiger Betrag ist.
 * Beispiele: "149" → 14900, "149,5" → 14950, "1.234,56" → 123456, "12.5" → 1250
 */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/\s|€/g, '');
  if (s === '') return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
  } else if (/^\d+(,\d{1,2})?$/.test(s)) {
    normalized = s.replace(',', '.'); // 149,5
  } else if (/^\d+(\.\d{1,2})?$/.test(s)) {
    normalized = s; // 12.5
  } else {
    return null;
  }
  const [euros, fraction = ''] = normalized.split('.');
  const cents = Number(euros) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export type VatSplit = { netCents: number; vatCents: number; grossCents: number };

/**
 * Teilt einen Bruttobetrag in Netto und USt.
 * Rundung: Netto = round(Brutto × 10000 / (10000 + Satz)), USt = Brutto − Netto
 * (so ist Netto + USt immer exakt der Bruttobetrag).
 */
export function splitGross(grossCents: number, vatRateBp: number): VatSplit {
  assertCents(grossCents);
  if (!Number.isInteger(vatRateBp) || vatRateBp < 0) throw new Error(`Ungültiger Steuersatz: ${vatRateBp}`);
  const netCents = vatRateBp === 0 ? grossCents : Math.round((grossCents * 10000) / (10000 + vatRateBp));
  return { netCents, vatCents: grossCents - netCents, grossCents };
}

/** Anteil eines Betrags in Prozent, auf ganze Cent abgerundet (für Erstattungen). */
export function percentOf(cents: number, percent: number): number {
  assertCents(cents);
  if (percent < 0 || percent > 100) throw new Error(`Ungültiger Prozentsatz: ${percent}`);
  return Math.floor((cents * percent) / 100);
}

/** Cent → Eingabewert für ein Formularfeld, z. B. 14950 → "149,50" (Komma, wird von parseEuroToCents gelesen). */
export function centsToInput(cents: number): string {
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}
