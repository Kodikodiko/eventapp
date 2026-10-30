/**
 * Kostengruppen und Ausgaben.
 * - Kostengruppen-Vorlagen sind global. Jedes Event hat eigene Kostengruppen (beim Anlegen aus den aktiven
 *   Vorlagen kopiert); Änderungen an einer Vorlage wirken nicht auf bestehende Event-Kostengruppen.
 * - Eventeigene Kostengruppen können als Vorlage freigegeben werden.
 * - Namen sind eindeutig (ohne Groß-/Kleinschreibung): unter den Vorlagen bzw. innerhalb eines Events.
 * - Kostengruppen werden nie gelöscht, nur deaktiviert. Deaktivierte Gruppen stehen für neue Ausgaben nicht zur Wahl.
 * - Ausgaben einer Gruppe mit Speaker-Zuordnung können einem Speaker des Events zugeordnet werden.
 * - Bezahlte Ausgaben können nicht gelöscht werden.
 */
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { nameKey, type CostGroupInput, type ExpenseInput, type ExpenseStatus } from '@/lib/validation/expenses';
import type { Db } from '@/server/db/core';
import { costGroupTemplates, eventCostGroups, events, expenses, people, speakers } from '@/server/db/schema';
import { readReceipt, removeReceipt, storeReceipt, type ReceiptUpload, type StoredReceipt } from '@/server/receipts/storage';
import { writeAudit, type Actor, type Tx } from './audit';

export type TemplateRow = typeof costGroupTemplates.$inferSelect & { eventCount: number };

export type StatusTotals = Record<ExpenseStatus, number> & { total: number };

export type EventGroupRow = typeof eventCostGroups.$inferSelect & {
  templateName: string | null;
  expenseCount: number;
  totals: StatusTotals;
};

export type ExpenseRow = typeof expenses.$inferSelect & {
  groupName: string;
  speakerName: string | null;
};

const emptyTotals = (): StatusTotals => ({ new: 0, planned: 0, paid: 0, total: 0 });

function loadWritableEvent(tx: Tx | Db, eventId: number) {
  const event = tx.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  return event;
}

function assertNameFree(rows: { id: number; name: string }[], name: string, exceptId?: number) {
  const key = nameKey(name);
  if (rows.some((r) => r.id !== exceptId && nameKey(r.name) === key)) throw new ServiceError('CONFLICT', { name: 'duplicateName' });
}

// ---------------------------------------------------------------------------
// Vorlagen (global)
// ---------------------------------------------------------------------------

export function listTemplates(db: Db): TemplateRow[] {
  const counts = new Map(
    db
      .select({ templateId: eventCostGroups.templateId, n: count() })
      .from(eventCostGroups)
      .groupBy(eventCostGroups.templateId)
      .all()
      .map((r) => [r.templateId, r.n])
  );
  return db
    .select()
    .from(costGroupTemplates)
    .orderBy(asc(costGroupTemplates.sortOrder), asc(costGroupTemplates.id))
    .all()
    .map((t) => ({ ...t, eventCount: counts.get(t.id) ?? 0 }));
}

function allTemplateNames(tx: Tx | Db) {
  return tx.select({ id: costGroupTemplates.id, name: costGroupTemplates.name }).from(costGroupTemplates).all();
}

function nextTemplateSort(tx: Tx | Db): number {
  return Math.max(0, ...tx.select({ s: costGroupTemplates.sortOrder }).from(costGroupTemplates).all().map((r) => r.s)) + 1;
}

export function createTemplate(db: Db, actor: Actor, input: CostGroupInput): number {
  return db.transaction((tx) => {
    assertNameFree(allTemplateNames(tx), input.name);
    const [row] = tx.insert(costGroupTemplates).values({ ...input, sortOrder: nextTemplateSort(tx) }).returning().all();
    writeAudit(tx, actor, { action: 'cost_group_template.created', entity: 'cost_group_template', entityId: row.id, summary: `Vorlage ${input.name}` });
    return row.id;
  });
}

/** Ändert nur die Vorlage – Kostengruppen bestehender Events bleiben unverändert. */
export function updateTemplate(db: Db, actor: Actor, id: number, input: CostGroupInput): void {
  db.transaction((tx) => {
    const current = tx.select().from(costGroupTemplates).where(eq(costGroupTemplates.id, id)).get();
    if (!current) throw new ServiceError('NOT_FOUND');
    assertNameFree(allTemplateNames(tx), input.name, id);
    tx.update(costGroupTemplates).set(input).where(eq(costGroupTemplates.id, id)).run();
    const summary = current.name !== input.name ? `Vorlage ${current.name} → ${input.name}` : `Vorlage ${input.name}`;
    writeAudit(tx, actor, { action: 'cost_group_template.updated', entity: 'cost_group_template', entityId: id, summary });
  });
}

export function setTemplateActive(db: Db, actor: Actor, id: number, active: boolean): void {
  db.transaction((tx) => {
    const current = tx.select().from(costGroupTemplates).where(eq(costGroupTemplates.id, id)).get();
    if (!current) throw new ServiceError('NOT_FOUND');
    if (Boolean(current.deactivatedAt) === !active) return;
    tx.update(costGroupTemplates)
      .set({ deactivatedAt: active ? null : new Date().toISOString() })
      .where(eq(costGroupTemplates.id, id))
      .run();
    writeAudit(tx, actor, {
      action: active ? 'cost_group_template.activated' : 'cost_group_template.deactivated',
      entity: 'cost_group_template',
      entityId: id,
      summary: `Vorlage ${current.name}`,
    });
  });
}

// ---------------------------------------------------------------------------
// Kostengruppen eines Events
// ---------------------------------------------------------------------------

function eventGroupNames(tx: Tx | Db, eventId: number) {
  return tx.select({ id: eventCostGroups.id, name: eventCostGroups.name }).from(eventCostGroups).where(eq(eventCostGroups.eventId, eventId)).all();
}

function nextGroupSort(tx: Tx | Db, eventId: number): number {
  const sorts = tx.select({ s: eventCostGroups.sortOrder }).from(eventCostGroups).where(eq(eventCostGroups.eventId, eventId)).all();
  return Math.max(0, ...sorts.map((r) => r.s)) + 1;
}

/**
 * Übernimmt aktive Vorlagen als Kostengruppen eines Events (beim Anlegen eines Events und auf Wunsch später).
 * Vorlagen, deren Name im Event schon vorkommt, werden übersprungen. Gibt die Anzahl neuer Gruppen zurück.
 */
export function instantiateTemplates(tx: Tx | Db, eventId: number): number {
  const existing = new Set(eventGroupNames(tx, eventId).map((g) => nameKey(g.name)));
  const templates = tx
    .select()
    .from(costGroupTemplates)
    .where(isNull(costGroupTemplates.deactivatedAt))
    .orderBy(asc(costGroupTemplates.sortOrder), asc(costGroupTemplates.id))
    .all()
    .filter((t) => !existing.has(nameKey(t.name)));
  let sort = nextGroupSort(tx, eventId);
  for (const t of templates) {
    tx.insert(eventCostGroups).values({ eventId, templateId: t.id, name: t.name, speakerLink: t.speakerLink, sortOrder: sort++ }).run();
  }
  return templates.length;
}

/** Beim Kopieren eines Events: aktive Kostengruppen der Vorlage-Ausgabe übernehmen (sonst die globalen Vorlagen). */
export function copyEventCostGroups(tx: Tx, sourceEventId: number, targetEventId: number): void {
  const groups = tx
    .select()
    .from(eventCostGroups)
    .where(and(eq(eventCostGroups.eventId, sourceEventId), isNull(eventCostGroups.deactivatedAt)))
    .orderBy(asc(eventCostGroups.sortOrder), asc(eventCostGroups.id))
    .all();
  if (groups.length === 0) {
    instantiateTemplates(tx, targetEventId);
    return;
  }
  tx.insert(eventCostGroups)
    .values(groups.map((g) => ({ eventId: targetEventId, templateId: g.templateId, name: g.name, speakerLink: g.speakerLink, sortOrder: g.sortOrder })))
    .run();
}

export function listEventGroups(db: Db, eventId: number): EventGroupRow[] {
  const rows = db
    .select({ g: eventCostGroups, templateName: costGroupTemplates.name })
    .from(eventCostGroups)
    .leftJoin(costGroupTemplates, eq(costGroupTemplates.id, eventCostGroups.templateId))
    .where(eq(eventCostGroups.eventId, eventId))
    .orderBy(asc(eventCostGroups.sortOrder), asc(eventCostGroups.id))
    .all();
  const sums = db
    .select({ groupId: expenses.costGroupId, status: expenses.status, amountCents: expenses.amountCents })
    .from(expenses)
    .where(eq(expenses.eventId, eventId))
    .all();
  const byGroup = new Map<number, { count: number; totals: StatusTotals }>();
  for (const s of sums) {
    const entry = byGroup.get(s.groupId) ?? { count: 0, totals: emptyTotals() };
    entry.count += 1;
    entry.totals[s.status] += s.amountCents;
    entry.totals.total += s.amountCents;
    byGroup.set(s.groupId, entry);
  }
  return rows.map(({ g, templateName }) => ({
    ...g,
    templateName,
    expenseCount: byGroup.get(g.id)?.count ?? 0,
    totals: byGroup.get(g.id)?.totals ?? emptyTotals(),
  }));
}

export function eventTotals(groups: EventGroupRow[]): StatusTotals {
  const totals = emptyTotals();
  for (const g of groups) {
    for (const k of ['new', 'planned', 'paid', 'total'] as const) totals[k] += g.totals[k];
  }
  return totals;
}

export function createEventGroup(db: Db, actor: Actor, eventId: number, input: CostGroupInput): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    assertNameFree(eventGroupNames(tx, eventId), input.name);
    const [row] = tx
      .insert(eventCostGroups)
      .values({ ...input, eventId, templateId: null, sortOrder: nextGroupSort(tx, eventId) })
      .returning()
      .all();
    writeAudit(tx, actor, { action: 'cost_group.created', entity: 'cost_group', entityId: row.id, eventId, summary: `Kostengruppe ${input.name}` });
    return row.id;
  });
}

function loadGroup(tx: Tx | Db, id: number) {
  const group = tx.select().from(eventCostGroups).where(eq(eventCostGroups.id, id)).get();
  if (!group) throw new ServiceError('NOT_FOUND');
  loadWritableEvent(tx, group.eventId);
  return group;
}

export function updateEventGroup(db: Db, actor: Actor, id: number, input: CostGroupInput): void {
  db.transaction((tx) => {
    const current = loadGroup(tx, id);
    assertNameFree(eventGroupNames(tx, current.eventId), input.name, id);
    if (current.speakerLink && !input.speakerLink) {
      const withSpeaker = tx.select({ speakerId: expenses.speakerId }).from(expenses).where(eq(expenses.costGroupId, id)).all().some((e) => e.speakerId != null);
      if (withSpeaker) throw new ServiceError('CONFLICT', { speakerLink: 'groupHasSpeakerCosts' });
    }
    tx.update(eventCostGroups).set(input).where(eq(eventCostGroups.id, id)).run();
    const summary = current.name !== input.name ? `Kostengruppe ${current.name} → ${input.name}` : `Kostengruppe ${input.name}`;
    writeAudit(tx, actor, { action: 'cost_group.updated', entity: 'cost_group', entityId: id, eventId: current.eventId, summary });
  });
}

export function setEventGroupActive(db: Db, actor: Actor, id: number, active: boolean): void {
  db.transaction((tx) => {
    const current = loadGroup(tx, id);
    if (Boolean(current.deactivatedAt) === !active) return;
    tx.update(eventCostGroups)
      .set({ deactivatedAt: active ? null : new Date().toISOString() })
      .where(eq(eventCostGroups.id, id))
      .run();
    writeAudit(tx, actor, {
      action: active ? 'cost_group.activated' : 'cost_group.deactivated',
      entity: 'cost_group',
      entityId: id,
      eventId: current.eventId,
      summary: `Kostengruppe ${current.name}`,
    });
  });
}

/** Gibt eine eventeigene Kostengruppe als globale Vorlage frei (die Gruppe verweist danach auf die Vorlage). */
export function publishEventGroup(db: Db, actor: Actor, id: number): number {
  return db.transaction((tx) => {
    const group = loadGroup(tx, id);
    if (group.templateId != null) throw new ServiceError('CONFLICT', { _form: 'alreadyTemplate' });
    const taken = allTemplateNames(tx).some((t) => nameKey(t.name) === nameKey(group.name));
    if (taken) throw new ServiceError('CONFLICT', { _form: 'templateNameTaken' });
    const [template] = tx
      .insert(costGroupTemplates)
      .values({ name: group.name, speakerLink: group.speakerLink, sortOrder: nextTemplateSort(tx) })
      .returning()
      .all();
    tx.update(eventCostGroups).set({ templateId: template.id }).where(eq(eventCostGroups.id, id)).run();
    writeAudit(tx, actor, {
      action: 'cost_group.published',
      entity: 'cost_group',
      entityId: id,
      eventId: group.eventId,
      summary: `Kostengruppe ${group.name} als Vorlage freigegeben`,
    });
    return template.id;
  });
}

/** Neue (bzw. im Event noch fehlende) aktive Vorlagen ins Event übernehmen. */
export function addTemplatesToEvent(db: Db, actor: Actor, eventId: number): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const added = instantiateTemplates(tx, eventId);
    if (added > 0) writeAudit(tx, actor, { action: 'cost_group.templates_added', entity: 'cost_group', eventId, summary: `${added} Vorlage(n) übernommen` });
    return added;
  });
}

// ---------------------------------------------------------------------------
// Ausgaben
// ---------------------------------------------------------------------------

export function listExpenses(db: Db, eventId: number): ExpenseRow[] {
  return db
    .select({ e: expenses, groupName: eventCostGroups.name, firstName: people.firstName, lastName: people.lastName })
    .from(expenses)
    .innerJoin(eventCostGroups, eq(eventCostGroups.id, expenses.costGroupId))
    .leftJoin(speakers, eq(speakers.id, expenses.speakerId))
    .leftJoin(people, eq(people.id, speakers.personId))
    .where(eq(expenses.eventId, eventId))
    .orderBy(desc(expenses.spentOn), desc(expenses.id))
    .all()
    .map(({ e, groupName, firstName, lastName }) => ({
      ...e,
      groupName,
      speakerName: firstName != null || lastName != null ? `${firstName ?? ''} ${lastName ?? ''}`.trim() : null,
    }));
}

/** Prüft Kostengruppe und Speaker; liefert die zu speichernden Werte. */
function checkedValues(tx: Tx, eventId: number, input: ExpenseInput, currentGroupId?: number) {
  const group = tx.select().from(eventCostGroups).where(eq(eventCostGroups.id, input.costGroupId)).get();
  if (!group || group.eventId !== eventId) throw new ServiceError('INVALID', { costGroupId: 'invalid' });
  // Deaktivierte Gruppen: bestehende Ausgaben dürfen sie behalten, neue Zuordnungen sind nicht möglich
  if (group.deactivatedAt && group.id !== currentGroupId) throw new ServiceError('INVALID', { costGroupId: 'groupInactive' });
  let speakerId: number | null = null;
  if (group.speakerLink && input.speakerId != null) {
    const speaker = tx.select().from(speakers).where(eq(speakers.id, input.speakerId)).get();
    if (!speaker || speaker.eventId !== eventId) throw new ServiceError('INVALID', { speakerId: 'invalid' });
    speakerId = speaker.id;
  }
  return { ...input, speakerId };
}

function summaryOf(input: ExpenseInput, groupName: string) {
  return `Ausgabe ${groupName}, ${(input.amountCents / 100).toFixed(2)} €, Status ${input.status}`;
}

export function createExpense(db: Db, actor: Actor, eventId: number, input: ExpenseInput, receipt?: ReceiptUpload | null): number {
  loadWritableEvent(db, eventId);
  const stored: StoredReceipt | null = receipt ? storeReceipt(eventId, receipt) : null;
  try {
    return db.transaction((tx) => {
      loadWritableEvent(tx, eventId);
      const values = checkedValues(tx, eventId, input);
      const [row] = tx
        .insert(expenses)
        .values({ ...values, ...(stored ?? {}), eventId, createdBy: actor.userId })
        .returning()
        .all();
      const groupName = tx.select({ name: eventCostGroups.name }).from(eventCostGroups).where(eq(eventCostGroups.id, values.costGroupId)).get()!.name;
      writeAudit(tx, actor, { action: 'expense.created', entity: 'expense', entityId: row.id, eventId, summary: summaryOf(values, groupName) });
      return row.id;
    });
  } catch (error) {
    removeReceipt(stored?.receiptPath);
    throw error;
  }
}

export type ReceiptChange = { upload?: ReceiptUpload | null; remove?: boolean };

export function updateExpense(db: Db, actor: Actor, id: number, input: ExpenseInput, receipt: ReceiptChange = {}): void {
  const current = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!current) throw new ServiceError('NOT_FOUND');
  loadWritableEvent(db, current.eventId);
  const stored: StoredReceipt | null = receipt.upload ? storeReceipt(current.eventId, receipt.upload) : null;
  const dropOld = Boolean(stored || receipt.remove);
  try {
    db.transaction((tx) => {
      const before = tx.select().from(expenses).where(eq(expenses.id, id)).get();
      if (!before) throw new ServiceError('NOT_FOUND');
      const values = checkedValues(tx, before.eventId, input, before.costGroupId);
      const receiptValues = stored ?? (receipt.remove ? { receiptPath: null, receiptName: null, receiptType: null, receiptSize: null } : {});
      tx.update(expenses)
        .set({ ...values, ...receiptValues, updatedAt: new Date().toISOString() })
        .where(eq(expenses.id, id))
        .run();
      const groupName = tx.select({ name: eventCostGroups.name }).from(eventCostGroups).where(eq(eventCostGroups.id, values.costGroupId)).get()!.name;
      const parts = [summaryOf(values, groupName)];
      if (before.status !== values.status) parts.push(`${before.status} → ${values.status}`);
      if (stored) parts.push('Beleg ersetzt');
      else if (receipt.remove && before.receiptPath) parts.push('Beleg entfernt');
      writeAudit(tx, actor, { action: 'expense.updated', entity: 'expense', entityId: id, eventId: before.eventId, summary: parts.join(', ') });
    });
  } catch (error) {
    removeReceipt(stored?.receiptPath);
    throw error;
  }
  if (dropOld) removeReceipt(current.receiptPath);
}

export function deleteExpense(db: Db, actor: Actor, id: number): void {
  const current = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!current) throw new ServiceError('NOT_FOUND');
  db.transaction((tx) => {
    loadWritableEvent(tx, current.eventId);
    if (current.status === 'paid') throw new ServiceError('CONFLICT', { _form: 'expensePaid' });
    tx.delete(expenses).where(eq(expenses.id, id)).run();
    writeAudit(tx, actor, {
      action: 'expense.deleted',
      entity: 'expense',
      entityId: id,
      eventId: current.eventId,
      summary: `Ausgabe ${(current.amountCents / 100).toFixed(2)} € gelöscht`,
    });
  });
  removeReceipt(current.receiptPath);
}

/** Beleg einer Ausgabe für den Download (null, wenn keiner vorhanden oder die Datei fehlt). */
export function expenseReceipt(db: Db, id: number) {
  const row = db.select().from(expenses).where(eq(expenses.id, id)).get();
  if (!row?.receiptPath || !row.receiptType) return null;
  const content = readReceipt(row.receiptPath);
  if (!content) return null;
  return { expense: row, fileName: row.receiptName ?? 'beleg', type: row.receiptType, content };
}
