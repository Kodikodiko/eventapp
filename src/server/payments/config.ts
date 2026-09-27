/** Ob die Online-Zahlung (Stripe) eingerichtet ist. Ohne Schlüssel wird Stripe öffentlich nicht angeboten. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
