/**
 * Grundbetrag eines Sponsors: mit Paket Paketpreis und -steuersatz, ohne Paket der eigene Betrag (Endpreis wie bei
 * Paketen) mit eigenem Steuersatz. Der Rabatt wird davon abgezogen (nie negativ).
 */
export const DEFAULT_SPONSOR_VAT_BP = 2000;

export function sponsorBase(
  s: { customPriceCents: number | null; customVatRateBp: number | null },
  pkg: { priceCents: number; vatRateBp: number } | null | undefined
): { priceCents: number; vatRateBp: number } {
  if (pkg) return { priceCents: pkg.priceCents, vatRateBp: pkg.vatRateBp };
  return { priceCents: s.customPriceCents ?? 0, vatRateBp: s.customVatRateBp ?? DEFAULT_SPONSOR_VAT_BP };
}

export function sponsorAmountCents(
  s: { customPriceCents: number | null; customVatRateBp: number | null; discountCents: number },
  pkg: { priceCents: number; vatRateBp: number } | null | undefined
): number {
  return Math.max(0, sponsorBase(s, pkg).priceCents - s.discountCents);
}
