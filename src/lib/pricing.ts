/**
 * Preisregeln für Tickets (rein, ohne Datenbank – Server und Browser).
 *
 * - Early Bird: eigener Preis für Normal- und Mitgliedsticket in einem Zeitraum (von–bis). Ohne „von“ gilt er
 *   ab sofort, ohne „bis“ oder ohne Preis gibt es keinen Early Bird für diesen Tickettyp.
 * - Rabattcode: gilt nur auf den Basispreis (Normal oder Mitglied), nie auf den Early-Bird-Preis.
 *   Ist der Early-Bird-Preis günstiger als Basispreis minus Code, gilt Early Bird und der Code wird nicht eingelöst.
 * - Ein Preis wird nie negativ.
 */

export type PriceTier = 'regular' | 'early_bird';
export type DiscountKind = 'fixed' | 'percent';

export type EarlyBirdSettings = {
  earlyBirdStartsAt: string | null;
  earlyBirdEndsAt: string | null;
  priceEarlyNormalCents: number | null;
  priceEarlyMemberCents: number | null;
};

export type BasePrices = { priceNormalCents: number; priceMemberCents: number };

export function earlyBirdWindowOpen(e: EarlyBirdSettings, now: Date): boolean {
  if (!e.earlyBirdEndsAt) return false;
  const t = now.toISOString();
  if (e.earlyBirdStartsAt && t < e.earlyBirdStartsAt) return false;
  return t < e.earlyBirdEndsAt;
}

/** Early-Bird-Preis für den Tickettyp, wenn er jetzt gilt; sonst null. */
export function earlyBirdPrice(e: EarlyBirdSettings, type: 'normal' | 'member', now: Date): number | null {
  if (!earlyBirdWindowOpen(e, now)) return null;
  return (type === 'member' ? e.priceEarlyMemberCents : e.priceEarlyNormalCents) ?? null;
}

/** Abzug eines Rabatts vom Basispreis in Cent (nie mehr als der Preis). value: Cent bzw. Basispunkte. */
export function discountAmount(kind: DiscountKind, value: number, baseCents: number): number {
  const raw = kind === 'fixed' ? value : Math.round((baseCents * value) / 10000);
  return Math.max(0, Math.min(baseCents, raw));
}

export type PriceResult = {
  priceCents: number;
  /** Preis ohne Rabatt (Basis- bzw. Early-Bird-Preis) */
  listPriceCents: number;
  tier: PriceTier;
  discountCents: number;
  /** true: Code war gültig, aber Early Bird ist günstiger – Code wird nicht eingelöst */
  earlyBirdCheaper: boolean;
};

export function computeTicketPrice(
  event: BasePrices & EarlyBirdSettings,
  type: 'normal' | 'member',
  discount: { kind: DiscountKind; value: number } | null,
  now: Date
): PriceResult {
  const base = type === 'member' ? event.priceMemberCents : event.priceNormalCents;
  const early = earlyBirdPrice(event, type, now);
  if (discount) {
    const off = discountAmount(discount.kind, discount.value, base);
    const discounted = base - off;
    if (early !== null && early <= discounted) {
      return { priceCents: early, listPriceCents: early, tier: 'early_bird', discountCents: 0, earlyBirdCheaper: true };
    }
    return { priceCents: discounted, listPriceCents: base, tier: 'regular', discountCents: off, earlyBirdCheaper: false };
  }
  if (early !== null) return { priceCents: early, listPriceCents: early, tier: 'early_bird', discountCents: 0, earlyBirdCheaper: false };
  return { priceCents: base, listPriceCents: base, tier: 'regular', discountCents: 0, earlyBirdCheaper: false };
}

/** Code für Vergleich und Speicherung: getrimmt, Großbuchstaben. */
export const normalizeCode = (code: string) => code.trim().toUpperCase();
export const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;

/** Kurzbeschreibung eines Rabatts, z. B. „−20 %“ oder „−50,00 €“ (Betrag formatiert der Aufrufer). */
export function percentLabel(bp: number): string {
  const v = bp / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace('.', ',');
}
