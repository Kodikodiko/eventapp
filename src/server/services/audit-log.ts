/**
 * Lesen des Audit-Logs für die Protokollseite (D8): filtern nach Event, Bereich, Admin und Zeitraum,
 * Suche in Aktion, Beschreibung und Datensatz-ID; seitenweise, neueste zuerst.
 */
import { and, asc, count, desc, eq, gte, isNull, lt, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type { AuditFilter } from '@/lib/audit-filter';
import { viennaInputToUtc } from '@/lib/dates';
import type { Db } from '@/server/db/core';
import { auditLog, authUsers, events } from '@/server/db/schema';

export const AUDIT_PAGE_SIZE = 50;

export type AuditRow = {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  eventId: number | null;
  eventName: (typeof events.$inferSelect)['name'] | null;
  actorUserId: string | null;
  actorName: string | null;
};

/** Nächster Kalendertag (YYYY-MM-DD). */
function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** LIKE ohne Groß-/Kleinschreibung (ASCII), % und _ im Suchbegriff wörtlich. */
function contains(col: AnyColumn, q: string): SQL {
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`${col} LIKE ${pattern} ESCAPE '\\'`;
}

function conditions(f: AuditFilter): SQL | undefined {
  const parts: SQL[] = [];
  if (f.eventId) parts.push(eq(auditLog.eventId, f.eventId));
  if (f.entity) parts.push(eq(auditLog.entity, f.entity));
  if (f.actor === 'system') parts.push(isNull(auditLog.actorUserId));
  else if (f.actor) parts.push(eq(auditLog.actorUserId, f.actor));
  const from = f.from ? viennaInputToUtc(`${f.from}T00:00`) : null;
  const to = f.to ? viennaInputToUtc(`${nextDay(f.to)}T00:00`) : null;
  if (from) parts.push(gte(auditLog.at, from));
  if (to) parts.push(lt(auditLog.at, to));
  if (f.q) parts.push(or(contains(auditLog.summary, f.q), contains(auditLog.action, f.q), contains(auditLog.entityId, f.q))!);
  return parts.length ? and(...parts) : undefined;
}

export function listAuditEntries(db: Db, f: AuditFilter): { rows: AuditRow[]; total: number; pages: number } {
  const where = conditions(f);
  const total = db.select({ n: count() }).from(auditLog).where(where).get()?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const rows = db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      summary: auditLog.summary,
      eventId: auditLog.eventId,
      eventName: events.name,
      actorUserId: auditLog.actorUserId,
      actorName: authUsers.name,
    })
    .from(auditLog)
    .leftJoin(events, eq(events.id, auditLog.eventId))
    .leftJoin(authUsers, eq(authUsers.id, auditLog.actorUserId))
    .where(where)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE)
    .offset((page - 1) * AUDIT_PAGE_SIZE)
    .all();
  return { rows, total, pages };
}

/** Auswahlwerte für die Filter: vorkommende Bereiche, Admins (auch gelöschte als ID) und Events. */
export function auditFilterOptions(db: Db) {
  const entities = db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(asc(auditLog.entity)).all().map((r) => r.entity);
  const actors = db
    .selectDistinct({ id: auditLog.actorUserId, name: authUsers.name })
    .from(auditLog)
    .leftJoin(authUsers, eq(authUsers.id, auditLog.actorUserId))
    .all()
    .filter((a): a is { id: string; name: string | null } => a.id !== null)
    .map((a) => ({ id: a.id, name: a.name ?? a.id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const eventList = db.select({ id: events.id, name: events.name }).from(events).orderBy(desc(events.startsAt)).all();
  return { entities, actors, events: eventList };
}
