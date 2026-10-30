/**
 * Sammel-Erstattung aus der Teilnehmerliste (z. B. Eventabsage oder Kulanz für alle):
 * - mit Storno: jede Anmeldung wird storniert, Erstattung nach Stornobedingungen oder festem Satz;
 * - ohne Storno: Teilerstattung von p % des noch erstattbaren Betrags, Anmeldung bleibt bestehen.
 * Erst Vorschau (previewBulkRefund), dann Ausführung (runBulkRefund) mit denselben Eingaben.
 * Eine fehlgeschlagene Anmeldung bricht den Rest nicht ab.
 */
import { eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { percentOf } from '@/lib/money';
import { cancellationAmounts } from '@/lib/refund-calc';
import type { Db } from '@/server/db/core';
import { events, people, registrations } from '@/server/db/schema';
import type { Mailer } from '@/server/mail';
import type { Refunder } from '@/server/payments/refunds';
import type { Actor } from './audit';
import { cancelAndProcess, refundAndProcess } from './cancellation';
import { quoteCancellation, refundableCents } from './refunds';

export type BulkRefundInput = {
  ids: number[];
  /** Anmeldungen dabei stornieren (Abmeldung) */
  cancel: boolean;
  /** Satz laut Stornobedingungen oder fester Satz */
  mode: 'rules' | 'percent';
  percent: number;
  reason: string;
  /** Stornobestätigung per E-Mail (nur mit Storno) */
  notify: boolean;
  /** Rücküberweisungen sind schon erledigt → sofort verbuchen */
  transferDone: boolean;
};

export type BulkSkip = 'alreadyCancelled' | 'nothingRefundable';

export type BulkRefundPreviewRow = {
  registrationId: number;
  name: string;
  percent: number;
  refundCents: number;
  creditCents: number;
  openCents: number;
  skip: BulkSkip | null;
};

export type BulkRefundPreview = { eventId: number; rows: BulkRefundPreviewRow[]; count: number; totalRefundCents: number };

export function previewBulkRefund(db: Db, input: BulkRefundInput, now = new Date()): BulkRefundPreview {
  const ids = [...new Set(input.ids)];
  const regs = db
    .select({ reg: registrations, person: people, event: events })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(inArray(registrations.id, ids))
    .all();
  if (regs.length !== ids.length || regs.length === 0) throw new ServiceError('NOT_FOUND');
  if (new Set(regs.map((r) => r.event.id)).size !== 1) throw new ServiceError('INVALID');
  if (regs[0].event.archivedAt) throw new ServiceError('ARCHIVED');

  const rows = regs.map(({ reg, person }): BulkRefundPreviewRow => {
    const name = `${person.lastName}, ${person.firstName}`;
    const quote = quoteCancellation(db, reg.id, now);
    const percent = input.mode === 'rules' ? (quote.rulePercent ?? 0) : input.percent;
    if (input.cancel) {
      if (reg.status === 'cancelled') return { registrationId: reg.id, name, percent, refundCents: 0, creditCents: 0, openCents: 0, skip: 'alreadyCancelled' };
      const a = cancellationAmounts({ invoiceCents: quote.invoiceCents, paidCents: quote.paidCents, percent });
      return { registrationId: reg.id, name, percent, refundCents: a.refundCents, creditCents: a.creditCents, openCents: a.openCents, skip: null };
    }
    const refund = percentOf(refundableCents(db, reg.id), percent);
    return { registrationId: reg.id, name, percent, refundCents: refund, creditCents: refund, openCents: 0, skip: refund > 0 ? null : 'nothingRefundable' };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const active = rows.filter((r) => !r.skip);
  return { eventId: regs[0].event.id, rows, count: active.length, totalRefundCents: active.reduce((s, r) => s + r.refundCents, 0) };
}

export type BulkRefundResult = { eventId: number; done: number; refundedCents: number; failed: number; awaitingTransfer: number; skipped: number };

export async function runBulkRefund(
  db: Db,
  actor: Actor,
  input: BulkRefundInput,
  options: { mailer?: Mailer; refunder?: Refunder; now?: Date } = {}
): Promise<BulkRefundResult> {
  const preview = previewBulkRefund(db, input, options.now);
  const result: BulkRefundResult = { eventId: preview.eventId, done: 0, refundedCents: 0, failed: 0, awaitingTransfer: 0, skipped: preview.rows.length - preview.count };
  for (const row of preview.rows) {
    if (row.skip) continue;
    try {
      if (input.cancel) {
        const r = await cancelAndProcess(
          db,
          actor,
          row.registrationId,
          { reason: input.reason, percent: row.percent, source: 'admin', notify: input.notify, transferDone: input.transferDone },
          options
        );
        result.refundedCents += r.amounts.refundCents;
        if (r.failedRefunds > 0) result.failed++;
        else if (r.refundStatus === 'approved' && !input.transferDone && r.executeIds.length < r.refundIds.length) result.awaitingTransfer++;
      } else {
        const r = await refundAndProcess(db, actor, row.registrationId, { amountCents: row.refundCents, reason: input.reason, transferDone: input.transferDone }, options);
        result.refundedCents += row.refundCents;
        if (r.status === 'failed') result.failed++;
        else if (r.status === 'approved') result.awaitingTransfer++;
      }
      result.done++;
    } catch (error) {
      console.error('[bulk-refund] Anmeldung', row.registrationId, error);
      result.failed++;
    }
  }
  return result;
}
