/**
 * Datum und Zeit: gespeichert wird in UTC (ISO-8601), eingegeben und angezeigt in Europe/Vienna.
 * Formularfelder vom Typ datetime-local liefern 'YYYY-MM-DDTHH:mm' ohne Zeitzone – das ist Wiener Ortszeit.
 */
export const TIME_ZONE = 'Europe/Vienna';

type Parts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsInVienna(ms: number): Parts {
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(new Date(ms))) p[part.type] = part.value;
  return p as Parts;
}

/** Abstand Wiener Ortszeit zu UTC in Millisekunden zum Zeitpunkt ms (Winter +1 h, Sommer +2 h). */
function viennaOffsetMs(ms: number): number {
  const p = partsInVienna(ms);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** ISO-Zeitpunkt (UTC) → Wert für ein datetime-local-Feld in Wiener Ortszeit. */
export function utcToViennaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const p = partsInVienna(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * datetime-local-Wert (Wiener Ortszeit) → ISO-Zeitpunkt in UTC. null bei ungültiger Eingabe.
 * Zeiten in der Umstellungslücke (letzter Sonntag im März, 02:00–03:00) werden auf die Sommerzeit verschoben.
 */
export function viennaInputToUtc(local: string | null | undefined): string | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null; // z. B. 31.02.
  let guess = naive - viennaOffsetMs(naive);
  guess = naive - viennaOffsetMs(guess);
  return new Date(guess).toISOString();
}

/** Kalendertag (YYYY-MM-DD) eines Zeitpunkts in Wien. */
export function viennaDate(iso: string): string {
  return utcToViennaInput(iso).slice(0, 10);
}

/** Reines Datum (YYYY-MM-DD, ohne Uhrzeit) lokalisiert anzeigen, z. B. 31.03.2027. */
export function formatDateOnly(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}
