/** Filter der Protokollseite: aus den URL-Parametern gelesen, ungültige Werte werden ignoriert. */
export type AuditFilter = {
  q: string;
  eventId: number | null;
  entity: string;
  /** Better-Auth-User-ID, 'system' für Einträge ohne Admin, '' = alle */
  actor: string;
  /** Kalendertage in Wiener Zeit (YYYY-MM-DD), '' = offen */
  from: string;
  to: string;
  page: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditFilter(sp: Record<string, string | string[] | undefined>): AuditFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v ?? '').trim();
  };
  const eventId = Number(one('event'));
  const page = Number(one('page'));
  return {
    q: one('q').slice(0, 100),
    eventId: Number.isInteger(eventId) && eventId > 0 ? eventId : null,
    entity: /^[a-z_]{1,40}$/.test(one('entity')) ? one('entity') : '',
    actor: one('actor').slice(0, 100),
    from: DAY.test(one('from')) ? one('from') : '',
    to: DAY.test(one('to')) ? one('to') : '',
    page: Number.isInteger(page) && page > 1 ? Math.min(page, 10000) : 1,
  };
}

/** URL-Parameter für einen Filter (leere Werte weglassen), optional mit anderer Seite. */
export function auditFilterQuery(f: AuditFilter, page = 1): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.q) q.q = f.q;
  if (f.eventId) q.event = String(f.eventId);
  if (f.entity) q.entity = f.entity;
  if (f.actor) q.actor = f.actor;
  if (f.from) q.from = f.from;
  if (f.to) q.to = f.to;
  if (page > 1) q.page = String(page);
  return q;
}
