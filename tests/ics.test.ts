import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText } from '@/lib/ics';

describe('Kalenderdatei (.ics)', () => {
  it('schreibt einen Termin in UTC mit maskiertem Text', () => {
    const ics = buildIcs({
      uid: 'event-1@example.at',
      title: 'Forum Day; 2026, Wien',
      startsAt: '2026-11-03T08:00:00.000Z',
      endsAt: '2026-11-03T18:30:00.000Z',
      location: 'BFI Wien, Wohlmutstraße 22',
      url: 'https://example.at/de/events/forum-day-2026',
      stamp: new Date('2026-11-19T20:00:00.000Z'),
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261103T080000Z\r\n');
    expect(ics).toContain('DTEND:20261103T183000Z\r\n');
    expect(ics).toContain('DTSTAMP:20261119T200000Z\r\n');
    expect(ics).toContain('SUMMARY:Forum Day\\; 2026\\, Wien\r\n');
    expect(ics).toContain('LOCATION:BFI Wien\\, Wohlmutstraße 22\r\n');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });

  it('bricht lange Zeilen um und lässt leere Felder weg', () => {
    const ics = buildIcs({ uid: 'x', title: 'A'.repeat(200), startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-01-01T01:00:00Z' });
    expect(ics.split('\r\n').every((l) => [...l].length <= 75)).toBe(true);
    expect(ics).not.toContain('LOCATION');
  });

  it('maskiert Zeilenumbrüche und Backslashes', () => {
    expect(escapeIcsText('a\\b\nc')).toBe('a\\\\b\\nc');
  });
});
