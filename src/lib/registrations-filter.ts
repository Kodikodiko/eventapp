/**
 * Filter und Sortierung der Teilnehmerliste (Spezifikation 2.3).
 * Reine Funktionen: werden von der Tabelle im Browser und vom Excel-Export auf dem Server verwendet,
 * damit der Export genau die angezeigten Zeilen enthält.
 */
export const REGISTRATION_STATUS_KEYS = ['reserved', 'confirmed', 'waitlisted', 'cancelled'] as const;
export type RegistrationStatusKey = (typeof REGISTRATION_STATUS_KEYS)[number];

export const PAYMENT_STATUS_KEYS = ['open', 'paid', 'partially_refunded', 'refunded', 'not_required'] as const;
export type PaymentStatusKey = (typeof PAYMENT_STATUS_KEYS)[number];
export const PAYMENT_METHOD_KEYS = ['stripe', 'invoice', 'free'] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];
export const TICKET_TYPE_KEYS = ['normal', 'member'] as const;
export type TicketTypeKey = (typeof TICKET_TYPE_KEYS)[number];

export type RegistrationFilterRow = {
  id?: number;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  status: RegistrationStatusKey;
  roles: string[];
  createdAt: string;
  paymentStatus?: PaymentStatusKey;
  paymentMethod?: PaymentMethodKey;
  ticketType?: TicketTypeKey;
};

export type RegistrationFilter = {
  /** Teilnehmende müssen ALLE gewählten Rollen haben */
  roles: string[];
  /** Teilnehmende müssen EINEN der gewählten Status haben */
  statuses: RegistrationStatusKey[];
  /** Freitext in Name, E-Mail, Firma (Groß-/Kleinschreibung egal) */
  search: string;
  /** Zahlungsstatus (einer muss zutreffen) */
  payments?: PaymentStatusKey[];
  /** Zahlungsart (eine muss zutreffen) */
  methods?: PaymentMethodKey[];
  /** Tickettyp (einer muss zutreffen) */
  tickets?: TicketTypeKey[];
  /** nur diese Anmeldungen (Export einer Auswahl) */
  ids?: number[];
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
    if (filter.payments?.length && !(r.paymentStatus && filter.payments.includes(r.paymentStatus))) return false;
    if (filter.methods?.length && !(r.paymentMethod && filter.methods.includes(r.paymentMethod))) return false;
    if (filter.tickets?.length && !(r.ticketType && filter.tickets.includes(r.ticketType))) return false;
    if (filter.ids?.length && !(r.id !== undefined && filter.ids.includes(r.id))) return false;
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
  if (filter.payments?.length) p.set('payments', filter.payments.join(','));
  if (filter.methods?.length) p.set('methods', filter.methods.join(','));
  if (filter.tickets?.length) p.set('tickets', filter.tickets.join(','));
  if (filter.ids?.length) p.set('ids', filter.ids.join(','));
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
  const pick = <K extends string>(key: string, allowed: readonly K[]) => list(key).filter((v): v is K => (allowed as readonly string[]).includes(v));
  const ids = list('ids')
    .map(Number)
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .slice(0, 5000);
  return {
    filter: {
      roles: list('roles'),
      statuses,
      search: (p.get('q') ?? '').slice(0, 200),
      payments: pick('payments', PAYMENT_STATUS_KEYS),
      methods: pick('methods', PAYMENT_METHOD_KEYS),
      tickets: pick('tickets', TICKET_TYPE_KEYS),
      ids,
    },
    sort,
  };
}
