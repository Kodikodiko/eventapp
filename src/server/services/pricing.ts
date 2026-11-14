/**
 * Preisaktionen je Event: Sonderpreis-Kategorien und Rabattcodes (Early Bird steht direkt im Event).
 *
 * - Kategorien und Codes lassen sich nur löschen, solange keine Anmeldung sie verwendet; sonst deaktivieren.
 * - Einlösungen eines Codes = nicht stornierte Anmeldungen mit diesem Code (auch laufende Reservierungen,
 *   abgelaufene Reservierungen werden storniert und geben die Einlösung wieder frei).
 */
import { and, asc, count, eq, ne } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { normalizeCode } from '@/lib/pricing';
import type { DiscountCodeInput, PriceCategoryInput } from '@/lib/validation/pricing';
import type { Db } from '@/server/db/core';
import { discountCodes, events, priceCategories, registrations } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';

export type PriceCategoryRow = typeof priceCategories.$inferSelect & { usedCount: number };
export type DiscountCodeRow = typeof discountCodes.$inferSelect & { usedCount: number };

function loadWritableEvent(tx: Tx | Db, eventId: number) {
  const event = tx.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  return event;
}

// ---------------------------------------------------------------------------
// Sonderpreis-Kategorien
// ---------------------------------------------------------------------------

export function listPriceCategories(db: Db | Tx, eventId: number): PriceCategoryRow[] {
  const rows = db.select().from(priceCategories).where(eq(priceCategories.eventId, eventId)).orderBy(asc(priceCategories.sortOrder), asc(priceCategories.id)).all();
  const counts = new Map(
    db
      .select({ id: registrations.priceCategoryId, n: count() })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), ne(registrations.status, 'cancelled')))
      .groupBy(registrations.priceCategoryId)
      .all()
      .map((r) => [r.id, r.n])
  );
  return rows.map((r) => ({ ...r, usedCount: counts.get(r.id) ?? 0 }));
}

function assertCategoryNameFree(tx: Tx, eventId: number, name: string, exceptId?: number) {
  const same = tx
    .select({ id: priceCategories.id, name: priceCategories.name })
    .from(priceCategories)
    .where(eq(priceCategories.eventId, eventId))
    .all()
    .find((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
  if (same) throw new ServiceError('CONFLICT', { name: 'duplicateName' });
}

export function createPriceCategory(db: Db, actor: Actor, eventId: number, input: PriceCategoryInput): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    assertCategoryNameFree(tx, eventId, input.name);
    const max = tx.select({ n: count() }).from(priceCategories).where(eq(priceCategories.eventId, eventId)).get()?.n ?? 0;
    const [row] = tx.insert(priceCategories).values({ ...input, eventId, sortOrder: max }).returning().all();
    writeAudit(tx, actor, { action: 'price_category.created', entity: 'price_category', entityId: row.id, eventId, summary: `Sonderpreis ${input.name} (${input.priceCents} Cent)` });
    return row.id;
  });
}

export function updatePriceCategory(db: Db, actor: Actor, id: number, input: PriceCategoryInput): void {
  db.transaction((tx) => {
    const row = tx.select().from(priceCategories).where(eq(priceCategories.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, row.eventId);
    assertCategoryNameFree(tx, row.eventId, input.name, id);
    tx.update(priceCategories).set(input).where(eq(priceCategories.id, id)).run();
    writeAudit(tx, actor, { action: 'price_category.updated', entity: 'price_category', entityId: id, eventId: row.eventId, summary: `Sonderpreis ${input.name} (${input.priceCents} Cent${input.active ? '' : ', inaktiv'})` });
  });
}

export function deletePriceCategory(db: Db, actor: Actor, id: number): void {
  db.transaction((tx) => {
    const row = tx.select().from(priceCategories).where(eq(priceCategories.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, row.eventId);
    const used = tx.select({ n: count() }).from(registrations).where(eq(registrations.priceCategoryId, id)).get()?.n ?? 0;
    if (used > 0) throw new ServiceError('CONFLICT', { _form: 'priceCategoryInUse' });
    tx.delete(priceCategories).where(eq(priceCategories.id, id)).run();
    writeAudit(tx, actor, { action: 'price_category.deleted', entity: 'price_category', entityId: id, eventId: row.eventId, summary: `Sonderpreis ${row.name}` });
  });
}

/** Aktive Kategorie eines Events (für die Anmeldung im Admin); wirft INVALID, wenn sie nicht passt. */
export function requireActiveCategory(tx: Db | Tx, eventId: number, id: number) {
  const row = tx.select().from(priceCategories).where(eq(priceCategories.id, id)).get();
  if (!row || row.eventId !== eventId || !row.active) throw new ServiceError('INVALID', { priceCategoryId: 'invalid' });
  return row;
}

/** Kopiert die Kategorien in ein neues Event (beim Kopieren eines Events). Codes werden nicht kopiert. */
export function copyPriceCategories(tx: Tx, sourceId: number, targetId: number): void {
  const rows = tx.select().from(priceCategories).where(eq(priceCategories.eventId, sourceId)).all();
  if (rows.length) {
    tx.insert(priceCategories)
      .values(rows.map((r) => ({ eventId: targetId, name: r.name, priceCents: r.priceCents, active: r.active, sortOrder: r.sortOrder })))
      .run();
  }
}

// ---------------------------------------------------------------------------
// Rabattcodes
// ---------------------------------------------------------------------------

function usesOf(tx: Db | Tx, codeId: number): number {
  return (
    tx
      .select({ n: count() })
      .from(registrations)
      .where(and(eq(registrations.discountCodeId, codeId), ne(registrations.status, 'cancelled')))
      .get()?.n ?? 0
  );
}

export function listDiscountCodes(db: Db, eventId: number): DiscountCodeRow[] {
  const rows = db.select().from(discountCodes).where(eq(discountCodes.eventId, eventId)).orderBy(asc(discountCodes.code)).all();
  const counts = new Map(
    db
      .select({ id: registrations.discountCodeId, n: count() })
      .from(registrations)
      .where(and(eq(registrations.eventId, eventId), ne(registrations.status, 'cancelled')))
      .groupBy(registrations.discountCodeId)
      .all()
      .map((r) => [r.id, r.n])
  );
  return rows.map((r) => ({ ...r, usedCount: counts.get(r.id) ?? 0 }));
}

function assertCodeFree(tx: Tx, eventId: number, code: string, exceptId?: number) {
  const same = tx.select({ id: discountCodes.id }).from(discountCodes).where(and(eq(discountCodes.eventId, eventId), eq(discountCodes.code, code))).get();
  if (same && same.id !== exceptId) throw new ServiceError('CONFLICT', { code: 'codeTaken' });
}

const describe = (input: DiscountCodeInput) =>
  `Code ${input.code}: ${input.kind === 'percent' ? `${input.value / 100} %` : `${input.value} Cent`}${input.active ? '' : ', inaktiv'}`;

export function createDiscountCode(db: Db, actor: Actor, eventId: number, input: DiscountCodeInput): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    assertCodeFree(tx, eventId, input.code);
    const [row] = tx.insert(discountCodes).values({ ...input, eventId }).returning().all();
    writeAudit(tx, actor, { action: 'discount_code.created', entity: 'discount_code', entityId: row.id, eventId, summary: describe(input) });
    return row.id;
  });
}

export function updateDiscountCode(db: Db, actor: Actor, id: number, input: DiscountCodeInput): void {
  db.transaction((tx) => {
    const row = tx.select().from(discountCodes).where(eq(discountCodes.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, row.eventId);
    // Bereits eingelöste Codes behalten ihren Namen, damit Rechnungen und Auswertung nachvollziehbar bleiben
    if (input.code !== row.code && usesOf(tx, id) > 0) throw new ServiceError('CONFLICT', { code: 'codeInUse' });
    assertCodeFree(tx, row.eventId, input.code, id);
    tx.update(discountCodes).set(input).where(eq(discountCodes.id, id)).run();
    writeAudit(tx, actor, { action: 'discount_code.updated', entity: 'discount_code', entityId: id, eventId: row.eventId, summary: describe(input) });
  });
}

export function deleteDiscountCode(db: Db, actor: Actor, id: number): void {
  db.transaction((tx) => {
    const row = tx.select().from(discountCodes).where(eq(discountCodes.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, row.eventId);
    const used = tx.select({ n: count() }).from(registrations).where(eq(registrations.discountCodeId, id)).get()?.n ?? 0;
    if (used > 0) throw new ServiceError('CONFLICT', { _form: 'discountCodeInUse' });
    tx.delete(discountCodes).where(eq(discountCodes.id, id)).run();
    writeAudit(tx, actor, { action: 'discount_code.deleted', entity: 'discount_code', entityId: id, eventId: row.eventId, summary: `Code ${row.code}` });
  });
}

export type CodeCheck =
  | { status: 'valid'; code: typeof discountCodes.$inferSelect }
  | { status: 'invalid' | 'notYetValid' | 'expired' | 'exhausted' };

/** Prüft einen eingegebenen Code für ein Event zum Zeitpunkt now. */
export function checkDiscountCode(tx: Db | Tx, eventId: number, input: string, now: Date): CodeCheck {
  const code = normalizeCode(input);
  if (!code) return { status: 'invalid' };
  const row = tx.select().from(discountCodes).where(and(eq(discountCodes.eventId, eventId), eq(discountCodes.code, code))).get();
  if (!row || !row.active) return { status: 'invalid' };
  const t = now.toISOString();
  if (row.validFrom && t < row.validFrom) return { status: 'notYetValid' };
  if (row.validUntil && t >= row.validUntil) return { status: 'expired' };
  if (row.maxUses !== null && usesOf(tx, row.id) >= row.maxUses) return { status: 'exhausted' };
  return { status: 'valid', code: row };
}

/** Gibt es für das Event aktive Codes? (Steuert, ob die Anmeldung das Feld „Rabattcode“ zeigt.) */
export function hasActiveDiscountCodes(db: Db | Tx, eventId: number): boolean {
  return Boolean(db.select({ id: discountCodes.id }).from(discountCodes).where(and(eq(discountCodes.eventId, eventId), eq(discountCodes.active, true))).get());
}
