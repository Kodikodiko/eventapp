import { describe, expect, it } from 'vitest';
import { formatDateOnly, utcToViennaInput, viennaDate, viennaInputToUtc } from '@/lib/dates';

describe('Wiener Ortszeit ↔ UTC', () => {
  it('rechnet im Winter mit +1 h', () => {
    expect(viennaInputToUtc('2027-01-15T09:30')).toBe('2027-01-15T08:30:00.000Z');
    expect(utcToViennaInput('2027-01-15T08:30:00.000Z')).toBe('2027-01-15T09:30');
  });

  it('rechnet im Sommer mit +2 h', () => {
    expect(viennaInputToUtc('2027-05-12T09:00')).toBe('2027-05-12T07:00:00.000Z');
    expect(utcToViennaInput('2027-05-12T07:00:00.000Z')).toBe('2027-05-12T09:00');
  });

  it('behandelt die Zeitumstellung korrekt', () => {
    // Umstellung auf Sommerzeit am 28.03.2027: 01:59 ist noch Winterzeit, 03:00 schon Sommerzeit
    expect(viennaInputToUtc('2027-03-28T01:59')).toBe('2027-03-28T00:59:00.000Z');
    expect(viennaInputToUtc('2027-03-28T03:00')).toBe('2027-03-28T01:00:00.000Z');
    // Umstellung auf Winterzeit am 31.10.2027
    expect(viennaInputToUtc('2027-10-31T04:00')).toBe('2027-10-31T03:00:00.000Z');
  });

  it('ist in beide Richtungen stabil', () => {
    for (const local of ['2026-12-31T23:59', '2027-06-30T00:00', '2027-02-28T12:15']) {
      expect(utcToViennaInput(viennaInputToUtc(local))).toBe(local);
    }
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(viennaInputToUtc('')).toBeNull();
    expect(viennaInputToUtc('2027-02-31T10:00')).toBeNull();
    expect(viennaInputToUtc('2027-13-01T10:00')).toBeNull();
    expect(viennaInputToUtc('12.05.2027 09:00')).toBeNull();
    expect(utcToViennaInput(null)).toBe('');
  });

  it('liefert den Wiener Kalendertag', () => {
    expect(viennaDate('2027-05-11T22:30:00.000Z')).toBe('2027-05-12');
  });
});

describe('formatDateOnly', () => {
  it('zeigt reine Daten ohne Zeitzonenverschiebung', () => {
    expect(formatDateOnly('2027-03-31', 'de')).toBe('31.03.2027');
    expect(formatDateOnly('2027-03-31', 'en')).toBe('31 Mar 2027');
  });
});
