/**
 * Umrechnung zwischen gespeicherten Event-Daten und Formularwerten (Zeichenketten).
 * Keine 'use client'-Datei: wird auf dem Server (Seiten) und im Browser verwendet.
 */
import { utcToViennaInput } from '@/lib/dates';
import type { LocalizedText } from '@/lib/localized';
import { centsToInput } from '@/lib/money';
import type { CopyEventValues, EventFormValues } from './forms';

type EventLike = {
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  location: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  capacity: number;
  priceNormalCents: number;
  priceMemberCents: number;
  ticketVatRateBp: number;
  allowStripe: boolean;
  allowInvoice: boolean;
  refundMode: 'automatic' | 'approval';
};

const toPair = (v: LocalizedText | null | undefined) => ({ de: v?.de ?? '', en: v?.en ?? '' });

/** Vorschlag für ein neues Event: typische Stornostaffel, Stripe und Rechnung erlaubt, 20 % USt vorbelegt. */
export function emptyEventFormValues(): EventFormValues {
  return {
    slug: '',
    name: { de: '', en: '' },
    description: { de: '', en: '' },
    location: '',
    startsAt: '',
    endsAt: '',
    registrationOpensAt: '',
    registrationClosesAt: '',
    capacity: '100',
    priceNormal: '',
    priceMember: '',
    ticketVatRateBp: '2000',
    allowStripe: true,
    allowInvoice: true,
    refundMode: 'automatic',
    cancellationRules: [
      { daysBeforeEvent: '30', refundPercent: '100' },
      { daysBeforeEvent: '14', refundPercent: '50' },
      { daysBeforeEvent: '0', refundPercent: '0' },
    ],
  };
}

export function eventToFormValues(
  event: EventLike,
  rules: { daysBeforeEvent: number; refundPercent: number }[]
): EventFormValues {
  const vat = String(event.ticketVatRateBp);
  return {
    slug: event.slug,
    name: toPair(event.name),
    description: toPair(event.description),
    location: event.location,
    startsAt: utcToViennaInput(event.startsAt),
    endsAt: utcToViennaInput(event.endsAt),
    registrationOpensAt: utcToViennaInput(event.registrationOpensAt),
    registrationClosesAt: utcToViennaInput(event.registrationClosesAt),
    capacity: String(event.capacity),
    priceNormal: centsToInput(event.priceNormalCents),
    priceMember: centsToInput(event.priceMemberCents),
    ticketVatRateBp: (['0', '1000', '1300', '2000'].includes(vat) ? vat : '2000') as EventFormValues['ticketVatRateBp'],
    allowStripe: event.allowStripe,
    allowInvoice: event.allowInvoice,
    refundMode: event.refundMode,
    cancellationRules: rules.map((r) => ({ daysBeforeEvent: String(r.daysBeforeEvent), refundPercent: String(r.refundPercent) })),
  };
}

/** Vorschlag für Name und Kurzname einer Kopie. */
export function copySuggestion(event: { slug: string; name: LocalizedText }): CopyEventValues {
  const year = /(\d{4})/.exec(event.slug);
  const slug = year ? event.slug.replace(year[1], String(Number(year[1]) + 1)) : `${event.slug}-kopie`;
  const bump = (s: string) => {
    const m = /(\d{4})/.exec(s);
    return m ? s.replace(m[1], String(Number(m[1]) + 1)) : '';
  };
  return {
    slug,
    name: {
      de: bump(event.name.de) || `${event.name.de} (Kopie)`,
      en: event.name.en ? bump(event.name.en) || `${event.name.en} (copy)` : '',
    },
  };
}
