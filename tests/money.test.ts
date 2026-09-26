import { describe, expect, it } from 'vitest';
import { formatEuro, parseEuroToCents, percentOf, splitGross } from '@/lib/money';
import { localized, localizedList } from '@/lib/localized';

describe('Geldbeträge', () => {
  it('formatiert Euro je Sprache', () => {
    expect(formatEuro(14900, 'de').replace(/\s/g, ' ')).toBe('€ 149,00');
    expect(formatEuro(14900, 'en')).toBe('€149.00');
    expect(formatEuro(123456, 'de').replace(/\s/g, ' ')).toBe('€ 1.234,56');
  });

  it('liest Euro-Eingaben', () => {
    expect(parseEuroToCents('149')).toBe(14900);
    expect(parseEuroToCents('149,5')).toBe(14950);
    expect(parseEuroToCents('1.234,56')).toBe(123456);
    expect(parseEuroToCents('12.5')).toBe(1250);
    expect(parseEuroToCents('€ 99,00')).toBe(9900);
    expect(parseEuroToCents('0')).toBe(0);
    expect(parseEuroToCents('')).toBeNull();
    expect(parseEuroToCents('abc')).toBeNull();
    expect(parseEuroToCents('1,234')).toBeNull();
    expect(parseEuroToCents('-5')).toBeNull();
  });

  it('teilt Brutto in Netto und USt ohne Rundungsdifferenz', () => {
    expect(splitGross(12000, 2000)).toEqual({ netCents: 10000, vatCents: 2000, grossCents: 12000 });
    expect(splitGross(14900, 0)).toEqual({ netCents: 14900, vatCents: 0, grossCents: 14900 });
    for (const gross of [1, 99, 14900, 9999, 123457]) {
      for (const rate of [0, 1000, 1300, 2000]) {
        const s = splitGross(gross, rate);
        expect(s.netCents + s.vatCents).toBe(gross);
      }
    }
    expect(() => splitGross(10.5, 2000)).toThrow();
  });

  it('berechnet Prozentanteile abgerundet', () => {
    expect(percentOf(14900, 100)).toBe(14900);
    expect(percentOf(14900, 50)).toBe(7450);
    expect(percentOf(999, 50)).toBe(499);
    expect(percentOf(14900, 0)).toBe(0);
    expect(() => percentOf(100, 101)).toThrow();
  });
});

describe('Mehrsprachige Inhalte', () => {
  it('fällt auf Deutsch zurück', () => {
    expect(localized({ de: 'Hallo', en: 'Hello' }, 'en')).toBe('Hello');
    expect(localized({ de: 'Hallo' }, 'en')).toBe('Hallo');
    expect(localized({ de: 'Hallo', en: '  ' }, 'en')).toBe('Hallo');
    expect(localized({ de: 'Hallo', en: 'Hello' }, 'de')).toBe('Hallo');
    expect(localized(null, 'de')).toBe('');
    expect(localizedList({ de: ['a'], en: [] }, 'en')).toEqual(['a']);
  });
});
