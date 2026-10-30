import { describe, expect, it } from 'vitest';
import { companyKey, companySuggestions, groupRows, type GroupableRow } from '@/lib/registration-groups';

const row = (o: Partial<GroupableRow> & { id: number }): GroupableRow & { id: number } => ({
  company: null,
  roles: ['attendee'],
  status: 'confirmed',
  paymentStatus: 'open',
  priceCents: 10000,
  ...o,
});

describe('Gruppieren der Teilnehmerliste', () => {
  it('führt Schreibweisen von Firmen zusammen', () => {
    expect(companyKey('ABC  Gmbh.')).toBe(companyKey('abc GmbH'));
    expect(companySuggestions(['ABC GmbH', 'abc gmbh', 'ABC GmbH', ' ', null, 'Beta KG'])).toEqual(['ABC GmbH', 'Beta KG']);
  });

  it('nach Firma: häufigste Schreibweise, Summen, ohne Firma zuletzt', () => {
    const rows = [
      row({ id: 1, company: 'ABC GmbH', paymentStatus: 'paid' }),
      row({ id: 2, company: 'abc gmbh' }),
      row({ id: 3, company: 'ABC GmbH', status: 'cancelled' }),
      row({ id: 4, company: null }),
      row({ id: 5, company: 'Alpha AG', status: 'waitlisted' }),
    ];
    const groups = groupRows(rows, 'company');
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['ABC GmbH', [1, 2, 3]],
      ['Alpha AG', [5]],
      [null, [4]],
    ]);
    expect(groups[0]).toMatchObject({ active: 2, paid: 1, open: 1, sumCents: 20000 });
  });

  it('nach Rolle: Personen mit mehreren Rollen in mehreren Gruppen', () => {
    const rows = [row({ id: 1, roles: ['attendee', 'speaker'] }), row({ id: 2, roles: ['attendee'] }), row({ id: 3, roles: ['sponsor'] })];
    const groups = groupRows(rows, 'role', ['attendee', 'speaker', 'organizer', 'sponsor']);
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.id)])).toEqual([
      ['attendee', [1, 2]],
      ['speaker', [1]],
      ['sponsor', [3]],
    ]);
  });

  it('nach Status und Zahlung in fester Reihenfolge', () => {
    const rows = [row({ id: 1, status: 'cancelled' }), row({ id: 2, status: 'confirmed', paymentStatus: 'paid' }), row({ id: 3, status: 'waitlisted' })];
    expect(groupRows(rows, 'status').map((g) => g.key)).toEqual(['confirmed', 'waitlisted', 'cancelled']);
    expect(groupRows(rows, 'payment').map((g) => g.key)).toEqual(['open', 'paid']);
  });
});
