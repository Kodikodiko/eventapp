/**
 * Berechnungen zu Storno und Erstattung (Spezifikation 3.3) – ohne Datenbank, auch im Browser nutzbar.
 *
 * Stornobedingungen: Zeilen „mindestens N Tage vor Beginn → P % Erstattung“; es gilt die Zeile mit der höchsten
 * Tagesanzahl, die noch erreicht ist. Keine passende Zeile (oder keine Bedingungen) → 0 %.
 *
 * Beträge bei einer Stornierung mit Erstattungssatz p:
 *   G = noch gültiger Rechnungsbetrag (Rechnung − bisherige Gutschriften; ohne Rechnung: bezahlter Betrag)
 *   Gutschrift = p % von G (abgerundet), Stornogebühr = G − Gutschrift
 *   Erstattung = bezahlt − Stornogebühr (mind. 0), offen bleibt = Stornogebühr − bezahlt (mind. 0)
 */
import { viennaDate } from './dates';
import { percentOf } from './money';

export type CancellationRule = { daysBeforeEvent: number; refundPercent: number };

/** Ganze Kalendertage (Wien) vom Stornozeitpunkt bis zum Eventbeginn; negativ nach Beginn. */
export function daysBeforeEvent(eventStartsAt: string, at: string): number {
  const start = Date.parse(`${viennaDate(eventStartsAt)}T00:00:00Z`);
  const day = Date.parse(`${viennaDate(at)}T00:00:00Z`);
  return Math.round((start - day) / 86_400_000);
}

/** Erstattungssatz laut Stornobedingungen; null, wenn keine Bedingungen hinterlegt sind. */
export function refundPercentFor(rules: CancellationRule[], daysBefore: number): number | null {
  if (rules.length === 0) return null;
  const match = rules.filter((r) => r.daysBeforeEvent <= daysBefore).sort((a, b) => b.daysBeforeEvent - a.daysBeforeEvent)[0];
  return match ? match.refundPercent : 0;
}

export type CancellationAmounts = { creditCents: number; feeCents: number; refundCents: number; openCents: number };

export function cancellationAmounts(input: { invoiceCents: number; paidCents: number; percent: number }): CancellationAmounts {
  const percent = Math.min(100, Math.max(0, Math.round(input.percent)));
  const creditCents = percentOf(Math.max(0, input.invoiceCents), percent);
  const feeCents = Math.max(0, input.invoiceCents) - creditCents;
  return {
    creditCents,
    feeCents,
    refundCents: Math.max(0, input.paidCents - feeCents),
    openCents: Math.max(0, feeCents - input.paidCents),
  };
}
