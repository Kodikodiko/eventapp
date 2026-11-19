/**
 * Kalenderdatei (iCalendar, RFC 5545) für einen einzelnen Termin, z. B. „In Kalender speichern“ nach der Anmeldung.
 * Zeiten werden in UTC geschrieben, damit jeder Kalender sie in die eigene Zeitzone umrechnet.
 */
export type IcsEvent = {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  description?: string;
  url?: string;
  /** Zeitstempel der Datei (DTSTAMP), Standard: jetzt */
  stamp?: Date;
};

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Text nach RFC 5545 maskieren: Backslash, Strichpunkt, Komma und Zeilenumbrüche. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen über 75 Zeichen umbrechen (Folgezeilen beginnen mit Leerzeichen). */
function fold(line: string): string {
  const chars = [...line];
  if (chars.length <= 75) return line;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i += i === 0 ? 75 : 74) parts.push(chars.slice(i, i + (i === 0 ? 75 : 74)).join(''));
  return parts.join('\r\n ');
}

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventFlow//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utc(event.stamp ?? new Date())}`,
    `DTSTART:${utc(new Date(event.startsAt))}`,
    `DTEND:${utc(new Date(event.endsAt))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : null,
    event.url ? `URL:${event.url}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);
  return lines.map(fold).join('\r\n') + '\r\n';
}
