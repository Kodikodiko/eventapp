/**
 * Filter und Sortierung der Teilnehmerliste (Spezifikation 2.3).
 * Reine Funktionen: werden von der Tabelle im Browser und vom Excel-Export auf dem Server verwendet,
 * damit der Export genau die angezeigten Zeilen enthält.
 */
export const REGISTRATION_STATUS_KEYS = ['reserved', 'confirmed', 'waitlisted', 'cancelled'] as const;
export type RegistrationStatusKey = (typeof REGISTRATION_STATUS_KEYS)[number];

export type RegistrationFilterRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  status: RegistrationStatusKey;
  roles: string[];
  createdAt: string;
};

export type RegistrationFilter = {
  /** Teilnehmende müssen ALLE gewählten Rollen haben */
  roles: string[];
  /** Teilnehmende müssen EINEN der gewählten Status haben */
  statuses: RegistrationStatusKey[];
  /** Freitext in Name, E-Mail, Firma (Groß-/Kleinschreibung egal) */
  search: string;
};

export type RegistrationSort = { key: 'name' | 'registered'; direction: 'asc' | 'desc' };

export const DEFAULT_SORT: RegistrationSort = { key: 'registered', direction: 'desc' };
export const EMPTY_FILTER: RegistrationFilter = { roles: [], statuses: [], search: '' };

const collator = new Intl.Collator('de', { sensitivity: 'base' });

export function filterAndSort<T extends RegistrationFilterRow>(rows: T[], filter: RegistrationFilter, sort: RegistrationSort): T[] {
  const needle = filter.search.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (filter.roles.length > 0 && !filter.roles.every((role) => r.roles.includes(role))) return false;
    if (filter.statuses.length > 0 && !filter.statuses.includes(r.status)) return false;
    if (needle) {
      const hay = `${r.firstName} ${r.lastName} ${r.email ?? ''} ${r.company ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const dir = sort.direction === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const c =
      sort.key === 'name'
        ? collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
        : a.createdAt.localeCompare(b.createdAt);
    return c * dir;
  });
}

/**
 * Klick auf ein Rollen-/Status-Badge: ohne Strg/Cmd wird genau dieser Wert gewählt (erneuter Klick hebt auf),
 * mit Strg/Cmd wird er zur Auswahl hinzugefügt bzw. entfernt.
 */
export function toggleSelection<T>(current: T[], value: T, multi: boolean): T[] {
  if (multi) return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return current.length === 1 && current[0] === value ? [] : [value];
}

/** Filter ↔ URL-Parameter (für den Export-Link). */
export function filterToSearchParams(filter: RegistrationFilter, sort: RegistrationSort): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.roles.length) p.set('roles', filter.roles.join(','));
  if (filter.statuses.length) p.set('statuses', filter.statuses.join(','));
  if (filter.search.trim()) p.set('q', filter.search.trim());
  p.set('sort', `${sort.key}:${sort.direction}`);
  return p;
}

export function filterFromSearchParams(p: URLSearchParams): { filter: RegistrationFilter; sort: RegistrationSort } {
  const list = (key: string) => (p.get(key) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const statuses = list('statuses').filter((s): s is RegistrationStatusKey =>
    (REGISTRATION_STATUS_KEYS as readonly string[]).includes(s)
  );
  const [key, direction] = (p.get('sort') ?? '').split(':');
  const sort: RegistrationSort =
    (key === 'name' || key === 'registered') && (direction === 'asc' || direction === 'desc') ? { key, direction } : DEFAULT_SORT;
  return { filter: { roles: list('roles'), statuses, search: (p.get('q') ?? '').slice(0, 200) }, sort };
}
