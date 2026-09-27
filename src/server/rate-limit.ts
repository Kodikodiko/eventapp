/**
 * Einfache Begrenzung von Anfragen pro Schlüssel (z. B. Aktion + IP) im Speicher des Prozesses.
 * Reicht für den Betrieb mit einem Node-Prozess (VPS); Einträge verfallen nach dem Zeitfenster.
 * Es wird nichts gespeichert oder protokolliert.
 */
type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export type RateLimit = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  register: { limit: 10, windowMs: 10 * 60_000 },
  quote: { limit: 40, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimit>;

/** Zählt einen Zugriff; false, wenn das Limit im Zeitfenster bereits erreicht ist. */
export function takeToken(key: string, { limit, windowMs }: RateLimit, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}

/** Nur für Tests. */
export function resetRateLimits() {
  buckets.clear();
  lastSweep = 0;
}

/** IP des Aufrufers: hinter Caddy aus X-Forwarded-For (erster Eintrag), sonst X-Real-IP. */
export function clientIp(h: Headers): string {
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip')?.trim() || 'unknown';
}
