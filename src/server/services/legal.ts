/**
 * Versionierte Rechtstexte: AGB (pro Event) und Datenschutzerklärung (global).
 * Eine neue Version ersetzt nie eine alte – Zustimmungen verweisen auf die Version, die gezeigt wurde.
 */
import { and, desc, eq, isNull, max } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { LocalizedText } from '@/lib/localized';
import type { Db } from '@/server/db/core';
import { events, legalDocuments } from '@/server/db/schema';
import { writeAudit, type Actor } from './audit';

export type LegalDocumentRow = typeof legalDocuments.$inferSelect;
export type LegalKind = 'terms' | 'privacy';

function scope(kind: LegalKind, eventId: number | null) {
  return and(eq(legalDocuments.kind, kind), eventId == null ? isNull(legalDocuments.eventId) : eq(legalDocuments.eventId, eventId));
}

export function listLegalVersions(db: Db, kind: LegalKind, eventId: number | null): LegalDocumentRow[] {
  return db.select().from(legalDocuments).where(scope(kind, eventId)).orderBy(desc(legalDocuments.version)).all();
}

/** Aktuelle Datenschutzerklärung (höchste Version). */
export function currentPrivacyNotice(db: Db): LegalDocumentRow | undefined {
  return listLegalVersions(db, 'privacy', null)[0];
}

/** Aktuelle AGB eines Events (die am Event hinterlegte Version). */
export function currentTerms(db: Db, eventId: number): LegalDocumentRow | undefined {
  const event = db.select({ termsDocumentId: events.termsDocumentId }).from(events).where(eq(events.id, eventId)).get();
  if (!event?.termsDocumentId) return undefined;
  return db.select().from(legalDocuments).where(eq(legalDocuments.id, event.termsDocumentId)).get();
}

/** Legt eine neue Version an; bei AGB wird sie sofort die gültige Version des Events. */
export function publishLegalVersion(
  db: Db,
  actor: Actor,
  kind: LegalKind,
  eventId: number | null,
  content: LocalizedText
): LegalDocumentRow {
  if (kind === 'terms' && eventId == null) throw new ServiceError('INVALID');
  if (kind === 'privacy' && eventId != null) throw new ServiceError('INVALID');
  return db.transaction((tx) => {
    if (eventId != null) {
      const event = tx.select().from(events).where(eq(events.id, eventId)).get();
      if (!event) throw new ServiceError('NOT_FOUND');
      if (event.archivedAt) throw new ServiceError('ARCHIVED');
    }
    const latest = tx.select({ v: max(legalDocuments.version) }).from(legalDocuments).where(scope(kind, eventId)).get()?.v ?? 0;
    const [doc] = tx
      .insert(legalDocuments)
      .values({ kind, eventId, version: latest + 1, content, validFrom: new Date().toISOString() })
      .returning()
      .all();
    if (kind === 'terms' && eventId != null) {
      tx.update(events).set({ termsDocumentId: doc.id }).where(eq(events.id, eventId)).run();
    }
    writeAudit(tx, actor, {
      action: `${kind}.published`,
      entity: 'legal_document',
      entityId: doc.id,
      eventId,
      summary: `${kind === 'terms' ? 'AGB' : 'Datenschutzerklärung'} Version ${doc.version} veröffentlicht`,
    });
    return doc;
  });
}
