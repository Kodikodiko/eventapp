import type { Db } from '@/server/db/core';
import { auditLog } from '@/server/db/schema';

/** Ausführender einer Aktion: Better-Auth-User-ID oder null für das System (Webhook, Zeitplan). */
export type Actor = { userId: string | null };

export const SYSTEM: Actor = { userId: null };

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Schreibt einen Audit-Eintrag – immer in derselben Transaktion wie die Änderung.
 * summary enthält keine personenbezogenen Daten (Namen, E-Mails), nur IDs und fachliche Angaben.
 */
export function writeAudit(
  tx: Tx | Db,
  actor: Actor,
  entry: { action: string; entity: string; entityId?: string | number | null; eventId?: number | null; summary?: string }
): void {
  tx.insert(auditLog)
    .values({
      actorUserId: actor.userId,
      eventId: entry.eventId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId == null ? null : String(entry.entityId),
      summary: entry.summary ?? '',
    })
    .run();
}

export type { Tx };
