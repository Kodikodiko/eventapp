import { describe, expect, it } from 'vitest';
import { seatTone, seatUsage } from '@/lib/seat-usage';

const row = (status: string, ...roles: string[]) => ({ status, roles });

describe('seatUsage', () => {
  it('teilt Bestätigte nach Rolle auf, Teilnehmer:in hat Vorrang, Stornierte zählen nicht', () => {
    const rows = [
      row('confirmed', 'attendee'),
      row('confirmed', 'attendee', 'speaker'),
      row('confirmed', 'speaker'),
      row('confirmed', 'orga'),
      row('confirmed', 'sponsor'),
      row('cancelled', 'attendee'),
      row('waitlisted', 'attendee'),
    ];
    const u = seatUsage(rows, { seatsTaken: 7, confirmed: 5, waitlisted: 1, offered: 1 }, 40);
    expect(u).toMatchObject({ attendee: 2, speaker: 1, orga: 1, other: 1, held: 2, taken: 7, free: 33, over: 0, waiting: 0, offered: 1, tone: 'ok' });
  });

  it('zeigt Überbuchung statt negativer freier Plätze', () => {
    const u = seatUsage([row('confirmed', 'attendee'), row('confirmed', 'attendee'), row('confirmed', 'speaker')], { seatsTaken: 3, confirmed: 3, waitlisted: 2, offered: 0 }, 2);
    expect(u).toMatchObject({ free: 0, over: 1, waiting: 2, tone: 'over' });
  });

  it('bewertet die Lage', () => {
    expect(seatTone(40, 7)).toBe('ok');
    expect(seatTone(40, 31)).toBe('few');
    expect(seatTone(250, 220)).toBe('ok');
    expect(seatTone(250, 230)).toBe('few');
    expect(seatTone(40, 40)).toBe('full');
    expect(seatTone(40, 41)).toBe('over');
  });
});
