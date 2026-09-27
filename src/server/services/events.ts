/**
 * Events: anlegen, bearbeiten, kopieren, archivieren, lesen.
 * Alle Schreibvorgänge laufen in einer Transaktion und schreiben einen Audit-Eintrag.
 */
import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { LocalizedText } from '@/lib/localized';
import type { EventInput } from '@/lib/validation/forms';
import type { Db } from '@/server/db/core';
import { cancellationRules, events, legalDocuments, registrations, sponsorPackages, waitlistOffers } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';

export type EventRow = typeof events.$inferSelect;
export type CancellationRuleRow = typeof cancellationRules.$inferSelect;

export function listEvents(db: Db, options: { includeArchived?: boolean } = {}): EventRow[] {
  const query = db.select().from(events);
  const rows = options.includeArchived ? query.all() : query.where(isNull(events.archivedAt)).all();
  return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function getEvent(db: Db, id: number): EventRow | undefined {
  return db.select().from(events).where(eq(events.id, id)).get();
}

export function getEventBySlug(db: Db, slug: string): EventRow | undefined {
  return db.select().from(events).where(eq(events.slug, slug)).get();
}

export function getCancellationRules(db: Db, eventId: number): CancellationRuleRow[] {
  return db
    .select()
    .from(cancellationRules)
    .where(eq(cancellationRules.eventId, eventId))
    .orderBy(desc(cancellationRules.daysBeforeEvent))
    .all();
}

export type EventStats = {
  reserved: number;
  confirmed: number;
  waitlisted: number;
  cancelled: number;
  /** offene Wartelisten-Angebote (halten einen Platz) */
  offered: number;
  seatsTaken: number;
  seatsFree: number;
};

/** Belegung: confirmed + reserved (nicht abgelaufen) + offene Wartelisten-Angebote zählen gegen die Kapazität. */
export function getEventStats(db: Db | Tx, event: EventRow, now = new Date()): EventStats {
  const rows = db
    .select({ status: registrations.status, n: count() })
    .from(registrations)
    .where(eq(registrations.eventId, event.id))
    .groupBy(registrations.status)
    .all();
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const activeReserved =
    db
      .select({ n: count() })
      .from(registrations)
      .where(
        and(
          eq(registrations.eventId, event.id),
          eq(registrations.status, 'reserved'),
          sql`${registrations.reservedUntil} > ${now.toISOString()}`
        )
      )
      .get()?.n ?? 0;
  const offered =
    db
      .select({ n: count() })
      .from(waitlistOffers)
      .innerJoin(registrations, eq(registrations.id, waitlistOffers.registrationId))
      .where(
        and(
          eq(registrations.eventId, event.id),
          eq(registrations.status, 'waitlisted'),
          isNull(waitlistOffers.acceptedAt),
          isNull(waitlistOffers.closedAt),
          gt(waitlistOffers.expiresAt, now.toISOString())
        )
      )
      .get()?.n ?? 0;
  const seatsTaken = (by.confirmed ?? 0) + activeReserved + offered;
  return {
    reserved: by.reserved ?? 0,
    confirmed: by.confirmed ?? 0,
    waitlisted: by.waitlisted ?? 0,
    cancelled: by.cancelled ?? 0,
    offered,
    seatsTaken,
    seatsFree: Math.max(0, event.capacity - seatsTaken),
  };
}

export type RegistrationState = 'archived' | 'notOpenYet' | 'open' | 'closed';

/**
 * Ob die öffentliche Anmeldung gerade möglich ist. Ohne Beginn gilt „sofort offen“,
 * ohne Ende schließt die Anmeldung mit Beginn des Events.
 */
export function registrationState(
  event: Pick<EventRow, 'archivedAt' | 'registrationOpensAt' | 'registrationClosesAt' | 'startsAt'>,
  now = new Date()
): RegistrationState {
  if (event.archivedAt) return 'archived';
  const iso = now.toISOString();
  if (event.registrationOpensAt && iso < event.registrationOpensAt) return 'notOpenYet';
  const closes = event.registrationClosesAt ?? event.startsAt;
  return iso < closes ? 'open' : 'closed';
}

function assertSlugFree(tx: Tx | Db, slug: string, exceptId?: number): void {
  const existing = tx.select({ id: events.id }).from(events).where(eq(events.slug, slug)).get();
  if (existing && existing.id !== exceptId) throw new ServiceError('CONFLICT', { slug: 'slugTaken' });
}

function replaceRules(tx: Tx, eventId: number, rules: EventInput['cancellationRules']): void {
  tx.delete(cancellationRules).where(eq(cancellationRules.eventId, eventId)).run();
  if (rules.length > 0) tx.insert(cancellationRules).values(rules.map((r) => ({ ...r, eventId }))).run();
}

function eventValues(input: EventInput) {
  const { cancellationRules: _rules, ...values } = input;
  return values;
}

export function createEvent(db: Db, actor: Actor, input: EventInput): EventRow {
  return db.transaction((tx) => {
    assertSlugFree(tx, input.slug);
    const [row] = tx.insert(events).values(eventValues(input)).returning().all();
    replaceRules(tx, row.id, input.cancellationRules);
    writeAudit(tx, actor, { action: 'event.created', entity: 'event', entityId: row.id, eventId: row.id, summary: `Event ${row.slug} angelegt` });
    return row;
  });
}

function loadEditable(tx: Tx | Db, id: number): EventRow {
  const row = tx.select().from(events).where(eq(events.id, id)).get();
  if (!row) throw new ServiceError('NOT_FOUND');
  if (row.archivedAt) throw new ServiceError('ARCHIVED');
  return row;
}

export function updateEvent(db: Db, actor: Actor, id: number, input: EventInput): EventRow {
  return db.transaction((tx) => {
    const before = loadEditable(tx, id);
    assertSlugFree(tx, input.slug, id);
    const [row] = tx.update(events).set(eventValues(input)).where(eq(events.id, id)).returning().all();
    replaceRules(tx, id, input.cancellationRules);
    const changed = (Object.keys(eventValues(input)) as (keyof ReturnType<typeof eventValues>)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(row[k])
    );
    writeAudit(tx, actor, {
      action: 'event.updated',
      entity: 'event',
      entityId: id,
      eventId: id,
      summary: changed.length ? `Geändert: ${changed.join(', ')}` : 'Stornobedingungen gespeichert',
    });
    return row;
  });
}

/**
 * Kopiert ein Event als Vorlage für die nächste Ausgabe: Einstellungen, Stornobedingungen,
 * aktuelle AGB (als Version 1) und Sponsorpakete. Anmeldungen, Speaker, Sponsoren und Programm nicht.
 */
export function copyEvent(db: Db, actor: Actor, sourceId: number, target: { slug: string; name: LocalizedText }): EventRow {
  return db.transaction((tx) => {
    const source = tx.select().from(events).where(eq(events.id, sourceId)).get();
    if (!source) throw new ServiceError('NOT_FOUND');
    assertSlugFree(tx, target.slug);
    const { id: _id, createdAt: _c, archivedAt: _a, termsDocumentId, ...copyable } = source;
    const [row] = tx
      .insert(events)
      .values({ ...copyable, slug: target.slug, name: target.name })
      .returning()
      .all();

    const rules = tx.select().from(cancellationRules).where(eq(cancellationRules.eventId, sourceId)).all();
    if (rules.length) {
      tx.insert(cancellationRules)
        .values(rules.map((r) => ({ eventId: row.id, daysBeforeEvent: r.daysBeforeEvent, refundPercent: r.refundPercent })))
        .run();
    }

    if (termsDocumentId) {
      const terms = tx.select().from(legalDocuments).where(eq(legalDocuments.id, termsDocumentId)).get();
      if (terms) {
        const [doc] = tx
          .insert(legalDocuments)
          .values({ kind: 'terms', eventId: row.id, version: 1, content: terms.content, validFrom: new Date().toISOString() })
          .returning()
          .all();
        tx.update(events).set({ termsDocumentId: doc.id }).where(eq(events.id, row.id)).run();
      }
    }

    const packages = tx.select().from(sponsorPackages).where(eq(sponsorPackages.eventId, sourceId)).orderBy(asc(sponsorPackages.sortOrder)).all();
    if (packages.length) {
      tx.insert(sponsorPackages)
        .values(packages.map(({ id: _pid, eventId: _e, ...p }) => ({ ...p, eventId: row.id })))
        .run();
    }

    writeAudit(tx, actor, {
      action: 'event.copied',
      entity: 'event',
      entityId: row.id,
      eventId: row.id,
      summary: `Kopie von Event ${sourceId} als ${row.slug}`,
    });
    return tx.select().from(events).where(eq(events.id, row.id)).get()!;
  });
}

export function setEventArchived(db: Db, actor: Actor, id: number, archived: boolean): EventRow {
  return db.transaction((tx) => {
    const row = tx.select().from(events).where(eq(events.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    const [updated] = tx
      .update(events)
      .set({ archivedAt: archived ? new Date().toISOString() : null })
      .where(eq(events.id, id))
      .returning()
      .all();
    writeAudit(tx, actor, {
      action: archived ? 'event.archived' : 'event.unarchived',
      entity: 'event',
      entityId: id,
      eventId: id,
      summary: archived ? 'Event archiviert' : 'Archivierung aufgehoben',
    });
    return updated;
  });
}
