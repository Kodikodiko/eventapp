/**
 * Belegung eines Events für die Anzeige (Belegungsleiste der Teilnehmerliste).
 * Zählregel wie getEventStats: bestätigt (jede Rolle, auch Speaker/Organisation) + gültige Reservierungen
 * + offene Wartelisten-Angebote belegen einen Platz, Stornierte nicht.
 */
export type SeatUsage = {
  capacity: number;
  /** bestätigte Anmeldungen nach Rolle; wer Teilnehmer:in ist, zählt dort, auch mit weiteren Rollen */
  attendee: number;
  speaker: number;
  orga: number;
  other: number;
  /** Reservierungen mit offener Zahlung + offene Wartelisten-Angebote */
  held: number;
  taken: number;
  free: number;
  /** Plätze über der Kapazität (Überbuchung), sonst 0 */
  over: number;
  /** auf der Warteliste ohne offenes Angebot */
  waiting: number;
  offered: number;
  tone: SeatTone;
};

export type SeatTone = 'ok' | 'few' | 'full' | 'over';

/** „Knapp“ ab 10 freien Plätzen oder 10 % der Kapazität (wie „Nur noch X Plätze“ auf der Eventseite). */
export const FEW_SEATS = 10;

export function seatTone(capacity: number, taken: number): SeatTone {
  const free = capacity - taken;
  if (free < 0) return 'over';
  if (free === 0) return 'full';
  return free <= FEW_SEATS || free / capacity <= 0.1 ? 'few' : 'ok';
}

export function seatUsage(
  rows: readonly { status: string; roles: readonly string[] }[],
  stats: { seatsTaken: number; confirmed: number; waitlisted: number; offered: number },
  capacity: number
): SeatUsage {
  let attendee = 0;
  let speaker = 0;
  let orga = 0;
  let other = 0;
  for (const r of rows) {
    if (r.status !== 'confirmed') continue;
    if (r.roles.includes('attendee') || r.roles.length === 0) attendee++;
    else if (r.roles.includes('speaker')) speaker++;
    else if (r.roles.includes('orga')) orga++;
    else other++;
  }
  const held = Math.max(0, stats.seatsTaken - stats.confirmed);
  const taken = stats.seatsTaken;
  return {
    capacity,
    attendee,
    speaker,
    orga,
    other,
    held,
    taken,
    free: Math.max(0, capacity - taken),
    over: Math.max(0, taken - capacity),
    waiting: Math.max(0, stats.waitlisted - stats.offered),
    offered: stats.offered,
    tone: seatTone(capacity, taken),
  };
}
