import { describe, expect, it } from 'vitest';
import { copySuggestion, emptyEventFormValues, eventToFormValues } from '@/lib/validation/event-values';
import { eventFormSchema, organizerFormSchema, toEventInput, type EventFormValues } from '@/lib/validation/forms';

function valid(): EventFormValues {
  return {
    ...emptyEventFormValues(),
    slug: 'pm-summit-2027',
    name: { de: 'PM Summit 2027', en: '' },
    location: 'Wien',
    startsAt: '2027-05-12T09:00',
    endsAt: '2027-05-12T18:00',
    registrationClosesAt: '2027-05-05T23:59',
    capacity: '120',
    priceNormal: '149',
    priceMember: '99,50',
  };
}

function errorsOf(values: EventFormValues): Record<string, string> {
  const r = eventFormSchema.safeParse(values);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('Event-Formular', () => {
  it('akzeptiert gültige Werte und wandelt sie um', () => {
    const parsed = eventFormSchema.parse(valid());
    const input = toEventInput(parsed);
    expect(input.name).toEqual({ de: 'PM Summit 2027' });
    expect(input.description).toBeNull();
    expect(input.startsAt).toBe('2027-05-12T07:00:00.000Z');
    expect(input.registrationOpensAt).toBeNull();
    expect(input.priceNormalCents).toBe(14900);
    expect(input.priceMemberCents).toBe(9950);
    expect(input.capacity).toBe(120);
    expect(input.cancellationRules.map((r) => r.daysBeforeEvent)).toEqual([30, 14, 0]);
  });

  it('meldet fehlende Pflichtfelder', () => {
    const e = errorsOf({ ...valid(), name: { de: ' ', en: '' }, startsAt: '', priceNormal: 'abc' });
    expect(e['name.de']).toBe('required');
    expect(e.startsAt).toBe('dateTime');
    expect(e.priceNormal).toBe('amount');
  });

  it('prüft den Kurznamen', () => {
    expect(errorsOf({ ...valid(), slug: 'PM Summit' }).slug).toBe('slugFormat');
    expect(errorsOf({ ...valid(), slug: '-abc' }).slug).toBe('slugFormat');
    expect(errorsOf({ ...valid(), slug: 'ab' }).slug).toBe('slugFormat');
    expect(errorsOf({ ...valid(), slug: 'herbst-2027' }).slug).toBeUndefined();
  });

  it('prüft die zeitliche Reihenfolge', () => {
    expect(errorsOf({ ...valid(), endsAt: '2027-05-12T08:00' }).endsAt).toBe('endBeforeStart');
    expect(errorsOf({ ...valid(), registrationOpensAt: '2027-05-06T00:00' }).registrationClosesAt).toBe('closeBeforeOpen');
    expect(errorsOf({ ...valid(), registrationClosesAt: '2027-05-13T00:00' }).registrationClosesAt).toBe('closeAfterEvent');
  });

  it('verlangt eine Zahlungsart, wenn Tickets etwas kosten', () => {
    expect(errorsOf({ ...valid(), allowStripe: false, allowInvoice: false }).allowStripe).toBe('paymentMethodRequired');
    expect(
      errorsOf({ ...valid(), allowStripe: false, allowInvoice: false, priceNormal: '0', priceMember: '0' }).allowStripe
    ).toBeUndefined();
  });

  it('prüft die Stornobedingungen', () => {
    const rules = [
      { daysBeforeEvent: '30', refundPercent: '100' },
      { daysBeforeEvent: '30', refundPercent: '50' },
      { daysBeforeEvent: '5', refundPercent: '150' },
    ];
    const e = errorsOf({ ...valid(), cancellationRules: rules });
    expect(e['cancellationRules.1.daysBeforeEvent']).toBe('duplicateDays');
    expect(e['cancellationRules.2.refundPercent']).toBe('outOfRange');
  });

  it('übersteht die Hin- und Rückumwandlung', () => {
    const input = toEventInput(eventFormSchema.parse(valid()));
    const again = eventToFormValues({ ...input }, input.cancellationRules);
    expect(toEventInput(eventFormSchema.parse(again))).toEqual(input);
  });
});

describe('Kopiervorschlag', () => {
  it('zählt die Jahreszahl hoch', () => {
    expect(copySuggestion({ slug: 'pm-summit-2027', name: { de: 'PM Summit 2027', en: 'PM Summit 2027' } })).toEqual({
      slug: 'pm-summit-2028',
      name: { de: 'PM Summit 2028', en: 'PM Summit 2028' },
    });
  });
  it('hängt ohne Jahreszahl „Kopie“ an', () => {
    expect(copySuggestion({ slug: 'workshop', name: { de: 'Workshop' } })).toEqual({
      slug: 'workshop-kopie',
      name: { de: 'Workshop (Kopie)', en: '' },
    });
  });
});

describe('Veranstalter-Formular', () => {
  const base = {
    name: 'Verein',
    address: 'Straße 1, Wien',
    vatId: '',
    iban: '',
    bic: '',
    contactEmail: '',
    vatMode: 'small_business' as const,
    smallBusinessNote: { de: '', en: '' },
    invoicePaymentTermDays: '14',
  };
  it('akzeptiert leere optionale Felder', () => {
    expect(organizerFormSchema.safeParse(base).success).toBe(true);
  });
  it('prüft E-Mail und Zahlungsziel', () => {
    expect(organizerFormSchema.safeParse({ ...base, contactEmail: 'kein-mail' }).success).toBe(false);
    expect(organizerFormSchema.safeParse({ ...base, invoicePaymentTermDays: '200' }).success).toBe(false);
  });
});
