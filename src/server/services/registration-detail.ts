/**
 * Detailansicht einer Anmeldung im Admin-Bereich (Detailpanel der Teilnehmerliste):
 * Stammdaten, Zustimmungen, Belege und Verlauf aus dem Audit-Log.
 */
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { auditLog, authUsers, consents, legalDocuments, payments, refunds, registrations } from '@/server/db/schema';
import { listInvoices, type InvoiceListRow } from './invoices';
import { listRegistrations, type RegistrationListRow } from './registrations';

export type ConsentView = { kind: (typeof consents.$inferSelect)['kind']; version: number | null; grantedAt: string; revokedAt: string | null };
export type HistoryEntry = { id: number; at: string; action: string; entity: string; summary: string; actorName: string | null; system: boolean };

export type RegistrationDetail = {
  row: RegistrationListRow;
  consents: ConsentView[];
  invoices: InvoiceListRow[];
  history: HistoryEntry[];
};

export const HISTORY_LIMIT = 30;

export function getRegistrationDetail(db: Db, registrationId: number, now = new Date()): RegistrationDetail | null {
  const reg = db.select({ eventId: registrations.eventId }).from(registrations).where(eq(registrations.id, registrationId)).get();
  if (!reg) return null;
  const row = listRegistrations(db, reg.eventId).find((r) => r.id === registrationId);
  if (!row) return null;

  // Zustimmungen der Person: aktuellste je Art (Einwilligungen gelten personenbezogen, AGB je Event)
  const consentRows = db
    .select({ c: consents, version: legalDocuments.version })
    .from(consents)
    .leftJoin(legalDocuments, eq(legalDocuments.id, consents.documentId))
    .where(and(eq(consents.personId, row.personId), or(eq(consents.eventId, reg.eventId), eq(consents.kind, 'privacy'), eq(consents.kind, 'photo'), eq(consents.kind, 'newsletter'))))
    .orderBy(desc(consents.grantedAt))
    .all();
  const latest = new Map<string, ConsentView>();
  for (const { c, version } of consentRows) {
    if (!latest.has(c.kind)) latest.set(c.kind, { kind: c.kind, version: version ?? null, grantedAt: c.grantedAt, revokedAt: c.revokedAt });
  }

  const invoiceRows = listInvoices(db, reg.eventId, now).filter((i) => i.registrationId === registrationId);
  const refundIds = db
    .select({ id: refunds.id })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(eq(payments.registrationId, registrationId))
    .all()
    .map((r) => String(r.id));

  const refs = [
    and(eq(auditLog.entity, 'registration'), eq(auditLog.entityId, String(registrationId))),
    invoiceRows.length ? and(eq(auditLog.entity, 'invoice'), inArray(auditLog.entityId, invoiceRows.map((i) => String(i.id)))) : undefined,
    refundIds.length ? and(eq(auditLog.entity, 'refund'), inArray(auditLog.entityId, refundIds)) : undefined,
  ].filter((x) => x !== undefined);
  const history = db
    .select({ a: auditLog, actorName: authUsers.name })
    .from(auditLog)
    .leftJoin(authUsers, eq(authUsers.id, auditLog.actorUserId))
    .where(or(...refs))
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(HISTORY_LIMIT)
    .all()
    .map(({ a, actorName }) => ({
      id: a.id,
      at: a.at,
      action: a.action,
      entity: a.entity,
      summary: a.summary,
      actorName: actorName ?? null,
      system: a.actorUserId === null,
    }));

  const order = ['terms', 'privacy', 'photo', 'newsletter'];
  return {
    row,
    consents: [...latest.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)),
    invoices: invoiceRows,
    history,
  };
}
