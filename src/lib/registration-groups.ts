/**
 * „Gruppieren nach“ in der Teilnehmerliste – reine Funktionen (Browser und Tests).
 * Firma: Schreibweisen werden zusammengeführt (Groß/Klein, Leerzeichen, Punkte, Rechtsform-Varianten wie „Gmbh“/„GmbH“);
 * angezeigt wird die häufigste Schreibweise. Rolle: eine Person mit mehreren Rollen steht in mehreren Gruppen.
 */
import { PAYMENT_STATUS_KEYS, REGISTRATION_STATUS_KEYS, type PaymentStatusKey, type RegistrationStatusKey } from './registrations-filter';

export const GROUP_BY_KEYS = ['none', 'company', 'role', 'status', 'payment'] as const;
export type GroupBy = (typeof GROUP_BY_KEYS)[number];

export type GroupableRow = {
  company: string | null;
  roles: string[];
  status: RegistrationStatusKey;
  paymentStatus: PaymentStatusKey;
  priceCents: number;
};

export type RowGroup<T> = {
  /** stabiler Schlüssel; '' = ohne Firma/Rolle */
  key: string;
  /** Anzeigetext für Firmen (häufigste Schreibweise); sonst null → Oberfläche übersetzt den Schlüssel */
  label: string | null;
  rows: T[];
  /** bestätigte/reservierte Personen (ohne Warteliste und Storno) */
  active: number;
  paid: number;
  open: number;
  /** Summe der Ticketpreise ohne stornierte Anmeldungen */
  sumCents: number;
};

/** Vergleichsschlüssel eines Firmennamens: „ABC  Gmbh.“ und „abc GmbH“ ergeben denselben Schlüssel. */
export function companyKey(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Eindeutige Firmennamen (häufigste Schreibweise je Schlüssel), alphabetisch – für die Vorschlagsliste. */
export function companySuggestions(names: (string | null | undefined)[]): string[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const n of names) {
    const key = companyKey(n);
    if (!key) continue;
    const m = spellings.get(key) ?? new Map<string, number>();
    const s = n!.trim();
    m.set(s, (m.get(s) ?? 0) + 1);
    spellings.set(key, m);
  }
  return [...spellings.values()].map(mostCommon).sort((a, b) => a.localeCompare(b, 'de'));
}

function mostCommon(m: Map<string, number>): string {
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))[0][0];
}

function stats<T extends GroupableRow>(key: string, label: string | null, rows: T[]): RowGroup<T> {
  const live = rows.filter((r) => r.status !== 'cancelled');
  return {
    key,
    label,
    rows,
    active: rows.filter((r) => r.status === 'confirmed' || r.status === 'reserved').length,
    paid: live.filter((r) => r.paymentStatus === 'paid').length,
    open: live.filter((r) => r.paymentStatus === 'open' && r.priceCents > 0).length,
    sumCents: live.reduce((s, r) => s + r.priceCents, 0),
  };
}

/** Teilt die (schon gefilterten und sortierten) Zeilen in Gruppen; die Reihenfolge innerhalb bleibt erhalten. */
export function groupRows<T extends GroupableRow>(rows: T[], by: GroupBy, roleOrder: string[] = []): RowGroup<T>[] {
  if (by === 'none') return [stats('', null, rows)];
  const buckets = new Map<string, T[]>();
  const spellings = new Map<string, Map<string, number>>();
  const push = (k: string, r: T) => buckets.set(k, [...(buckets.get(k) ?? []), r]);
  for (const r of rows) {
    if (by === 'company') {
      const k = companyKey(r.company);
      push(k, r);
      if (k) {
        const m = spellings.get(k) ?? new Map<string, number>();
        m.set(r.company!.trim(), (m.get(r.company!.trim()) ?? 0) + 1);
        spellings.set(k, m);
      }
    } else if (by === 'role') {
      if (r.roles.length === 0) push('', r);
      for (const role of r.roles) push(role, r);
    } else if (by === 'status') push(r.status, r);
    else push(r.paymentStatus, r);
  }
  const groups = [...buckets.entries()].map(([k, rs]) => stats(k, by === 'company' && k ? mostCommon(spellings.get(k)!) : null, rs));
  const order = (k: string): number => {
    if (by === 'status') return (REGISTRATION_STATUS_KEYS as readonly string[]).indexOf(k);
    if (by === 'payment') return (PAYMENT_STATUS_KEYS as readonly string[]).indexOf(k);
    if (by === 'role') return k === '' ? 999 : roleOrder.includes(k) ? roleOrder.indexOf(k) : 500;
    return 0;
  };
  return groups.sort((a, b) => {
    if (by === 'company') {
      if (!a.key !== !b.key) return a.key ? -1 : 1; // „ohne Firma“ zuletzt
      return (a.label ?? '').localeCompare(b.label ?? '', 'de');
    }
    return order(a.key) - order(b.key);
  });
}
