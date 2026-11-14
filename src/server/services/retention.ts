/**
 * Löschfristen (Spezifikation 7.5, D6) – täglich per `npm run retention` bzw. einmal am Tag aus `npm run jobs`.
 *
 * 1. Stornierte und Wartelisten-Anmeldungen ohne Zahlung und ohne Beleg: 30 Tage nach Eventende gelöscht.
 * 2. Übrige Personendaten: 6 Monate nach dem letzten Event, an dem die Person teilgenommen hat, anonymisiert.
 *    Speaker und Sponsor-Kontakte (Geschäftskontakte, berechtigtes Interesse): erst 3 Jahre nach ihrem letzten
 *    Event als Speaker bzw. Kontakt eines Sponsors. Es zählt jeweils die spätere der beiden Fristen.
 * 3. Personen ohne jede Anmeldung, Speaker-Rolle oder Sponsor-Zuordnung: nach 30 Tagen gelöscht.
 * 4. Rechnungen und Gutschriften: nach Ablauf von `retain_until` (31.12. + 7 Jahre, § 132 BAO) Empfänger geleert,
 *    PDF gelöscht; Nummer, Datum und Beträge bleiben (keine Personendaten, Nummernkreis bleibt lückenlos).
 * 5. Audit-Log: Einträge älter als 2 Jahre gelöscht.
 * 6. Abgelaufene Bestätigungs-/Anmeldelinks (enthalten E-Mail-Adressen) gelöscht.
 * 7. Datenbank-Sicherungen älter als 90 Tage gelöscht.
 *
 * Jeder Lauf schreibt einen Eintrag ins Audit-Log (nur Zahlen). Mit `dryRun` wird alles in einer Transaktion
 * berechnet und zurückgerollt; es werden keine Dateien gelöscht.
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { viennaDate } from '@/lib/dates';
import { pruneBackups } from '@/server/db/backup';
import type { Db } from '@/server/db/core';
import {
  auditLog,
  authUsers,
  authVerifications,
  events,
  invoices,
  payments,
  people,
  registrations,
} from '@/server/db/schema';
import { SYSTEM, type Tx } from './audit';
import { anonymizePersonTx } from './gdpr';

export const RETENTION = {
  /** übrige Personendaten: Monate nach dem letzten Event der Person */
  personMonths: 6,
  /** Speaker und Sponsor-Kontakte: Jahre nach ihrem letzten Event in dieser Rolle */
  businessContactYears: 3,
  /** stornierte/Wartelisten-Anmeldungen ohne Zahlung: Tage nach Eventende */
  unpaidRegistrationDays: 30,
  /** Personen ohne Bezug zu einem Event: Tage nach Anlage */
  orphanPersonDays: 30,
  /** Audit-Log: Jahre */
  auditYears: 2,
  /** Datenbank-Sicherungen: Tage */
  backupDays: 90,
} as const;

/** Platzhalter für den Empfänger eines Belegs nach Ablauf der Aufbewahrungsfrist. */
export const PURGED_RECIPIENT = 'Gelöscht (Aufbewahrungsfrist abgelaufen)';

export type RetentionSummary = {
  deletedRegistrations: number;
  anonymizedPeople: number;
  keptAsBusinessContact: number;
  deletedPeople: number;
  purgedInvoices: number;
  deletedAuditEntries: number;
  deletedVerifications: number;
  deletedBackups: number;
};

export type RetentionOptions = {
  now?: Date;
  dryRun?: boolean;
  /** Ordner mit den Datenbank-Sicherungen; ohne Angabe werden keine Sicherungen aufgeräumt */
  backupDir?: string | null;
  /** Ordner der Beleg-PDFs; ohne Angabe bleiben die Dateien liegen */
  invoiceDir?: string | null;
};

class DryRun extends Error {
  constructor(public readonly result: { summary: RetentionSummary; pdfFiles: string[] }) {
    super('dry-run');
  }
}

function minus(now: Date, { days = 0, months = 0, years = 0 }: { days?: number; months?: number; years?: number }): string {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years, d.getUTCMonth() - months, d.getUTCDate() - days);
  return d.toISOString();
}

/** 1. Stornierte/Wartelisten-Anmeldungen ohne erfolgreiche Zahlung und ohne Beleg. */
function deleteUnpaidRegistrations(tx: Tx, now: Date): number {
  const cutoff = minus(now, { days: RETENTION.unpaidRegistrationDays });
  const candidates = tx
    .select({ id: registrations.id })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(
      and(
        inArray(registrations.status, ['cancelled', 'waitlisted']),
        lt(events.endsAt, cutoff),
        // Unterabfragen mit Alias: Drizzle schreibt Spalten in sql`` ohne Tabellennamen
        sql`NOT EXISTS (SELECT 1 FROM payments x WHERE x.registration_id = "registrations"."id" AND x.status = 'succeeded')`,
        sql`NOT EXISTS (SELECT 1 FROM invoices x WHERE x.registration_id = "registrations"."id")`
      )
    )
    .all()
    .map((r) => r.id);
  if (!candidates.length) return 0;
  // abgebrochene/abgelaufene Zahlungsversuche hängen an der Anmeldung (ohne Erstattungen, da nie bezahlt)
  tx.delete(payments).where(inArray(payments.registrationId, candidates)).run();
  // Rollen und Wartelisten-Angebote werden mitgelöscht (ON DELETE CASCADE)
  return tx.delete(registrations).where(inArray(registrations.id, candidates)).run().changes;
}

/** Letztes Eventende je Person: als Teilnehmer:in (Anmeldung) bzw. als Speaker oder Sponsor-Kontakt. */
function lastEventEndByPerson(tx: Tx): Map<number, { attendee: string | null; business: string | null }> {
  const rows = tx
    .select({ personId: sql<number>`person_id`, kind: sql<string>`kind`, endsAt: sql<string>`max(ends_at)` })
    .from(
      sql`(
        SELECT r.person_id AS person_id, 'attendee' AS kind, e.ends_at AS ends_at FROM registrations r JOIN events e ON e.id = r.event_id
        UNION ALL
        SELECT s.person_id, 'business', e.ends_at FROM speakers s JOIN events e ON e.id = s.event_id
        UNION ALL
        SELECT c.person_id, 'business', e.ends_at FROM sponsor_contacts c JOIN sponsors sp ON sp.id = c.sponsor_id JOIN events e ON e.id = sp.event_id
      )`
    )
    .groupBy(sql`person_id`, sql`kind`)
    .all();
  const result = new Map<number, { attendee: string | null; business: string | null }>();
  for (const r of rows) {
    const id = Number(r.personId);
    const entry = result.get(id) ?? { attendee: null, business: null };
    entry[r.kind === 'business' ? 'business' : 'attendee'] = String(r.endsAt);
    result.set(id, entry);
  }
  return result;
}

/**
 * 2. Personen anonymisieren: 6 Monate nach dem letzten Event als Teilnehmer:in, Speaker und Sponsor-Kontakte
 * frühestens 3 Jahre nach ihrem letzten Event in dieser Rolle.
 */
function anonymizeExpiredPeople(tx: Tx, now: Date): { anonymized: number; keptAsBusinessContact: number } {
  const attendeeCutoff = minus(now, { months: RETENTION.personMonths });
  const businessCutoff = minus(now, { years: RETENTION.businessContactYears });
  const anonymizedIds = new Set(
    tx
      .select({ id: people.id })
      .from(people)
      .where(sql`${people.anonymizedAt} IS NOT NULL`)
      .all()
      .map((p) => p.id)
  );
  let anonymized = 0;
  let kept = 0;
  for (const [id, last] of lastEventEndByPerson(tx)) {
    if (anonymizedIds.has(id)) continue;
    if (last.attendee && last.attendee >= attendeeCutoff) continue;
    if (last.business && last.business >= businessCutoff) {
      // nach der 6-Monats-Regel wäre die Person fällig, als Geschäftskontakt bleibt sie
      if (last.business < attendeeCutoff) kept++;
      continue;
    }
    anonymizePersonTx(tx, SYSTEM, id, now, 'retention');
    anonymized++;
  }
  return { anonymized, keptAsBusinessContact: kept };
}

/** 3. Personen ohne Bezug zu einem Event löschen (Admins mit verknüpfter Person ausgenommen). */
function deleteOrphanPeople(tx: Tx, now: Date): number {
  const cutoff = minus(now, { days: RETENTION.orphanPersonDays });
  const orphans = tx
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        lt(people.createdAt, cutoff),
        sql`NOT EXISTS (SELECT 1 FROM registrations x WHERE x.person_id = "people"."id")`,
        sql`NOT EXISTS (SELECT 1 FROM speakers x WHERE x.person_id = "people"."id")`,
        sql`NOT EXISTS (SELECT 1 FROM sponsor_contacts x WHERE x.person_id = "people"."id")`,
        sql`NOT EXISTS (SELECT 1 FROM auth_users x WHERE x.person_id = "people"."id" AND x.role = 'admin')`
      )
    )
    .all()
    .map((p) => p.id);
  if (!orphans.length) return 0;
  // Portal-Konten ohne Person sind wertlos; Einwilligungen werden mitgelöscht, Anfragen verlieren den Bezug
  tx.delete(authUsers).where(and(inArray(authUsers.personId, orphans), eq(authUsers.role, 'attendee'))).run();
  return tx.delete(people).where(inArray(people.id, orphans)).run().changes;
}

/** 4. Belege nach Ablauf der Aufbewahrungsfrist: Empfänger leeren, PDF zum Löschen vormerken. */
function purgeExpiredInvoices(tx: Tx, now: Date): { purged: number; pdfPaths: string[] } {
  const today = viennaDate(now.toISOString());
  const rows = tx
    .select({ id: invoices.id, pdfPath: invoices.pdfPath, recipient: invoices.recipient })
    .from(invoices)
    .where(and(lt(invoices.retainUntil, today), sql`json_extract("invoices"."recipient", '$.name') <> ${PURGED_RECIPIENT}`))
    .all();
  const pdfPaths: string[] = [];
  for (const r of rows) {
    tx.update(invoices)
      .set({ recipient: { name: PURGED_RECIPIENT, company: null, address: '', vatId: null, email: null }, pdfPath: null })
      .where(eq(invoices.id, r.id))
      .run();
    if (r.pdfPath) pdfPaths.push(r.pdfPath);
  }
  return { purged: rows.length, pdfPaths };
}

/** Zeitpunkt des letzten Löschlaufs (aus dem Audit-Log) oder null. */
export function lastRetentionRun(db: Db): { at: string; summary: string } | null {
  return (
    db
      .select({ at: auditLog.at, summary: auditLog.summary })
      .from(auditLog)
      .where(eq(auditLog.action, 'retention.run'))
      .orderBy(desc(auditLog.at))
      .limit(1)
      .get() ?? null
  );
}

export function formatRetentionSummary(s: RetentionSummary): string {
  return (
    `Anmeldungen gelöscht ${s.deletedRegistrations}, Personen anonymisiert ${s.anonymizedPeople} ` +
    `(als Speaker/Sponsor-Kontakt noch behalten ${s.keptAsBusinessContact}), Personen gelöscht ${s.deletedPeople}, Belege geleert ${s.purgedInvoices}, ` +
    `Protokolleinträge gelöscht ${s.deletedAuditEntries}, Links gelöscht ${s.deletedVerifications}, Sicherungen gelöscht ${s.deletedBackups}`
  );
}

/** Ein Löschlauf. Gibt die Zahlen zurück (bei dryRun: was passieren würde). */
export function runRetention(db: Db, options: RetentionOptions = {}): RetentionSummary {
  const now = options.now ?? new Date();
  const dryRun = Boolean(options.dryRun);
  const backups = options.backupDir ? pruneBackups(options.backupDir, RETENTION.backupDays, { now, dryRun }) : 0;

  const work = (tx: Tx) => {
    const deletedRegistrations = deleteUnpaidRegistrations(tx, now);
    const people_ = anonymizeExpiredPeople(tx, now);
    const deletedPeople = deleteOrphanPeople(tx, now);
    const inv = purgeExpiredInvoices(tx, now);
    // Löscheinträge der Personen sind gerade erst geschrieben und damit nicht betroffen
    const deletedAuditEntries = tx.delete(auditLog).where(lt(auditLog.at, minus(now, { years: RETENTION.auditYears }))).run().changes;
    const deletedVerifications = tx.delete(authVerifications).where(lt(authVerifications.expiresAt, now)).run().changes;
    const summary: RetentionSummary = {
      deletedRegistrations,
      anonymizedPeople: people_.anonymized,
      keptAsBusinessContact: people_.keptAsBusinessContact,
      deletedPeople,
      purgedInvoices: inv.purged,
      deletedAuditEntries,
      deletedVerifications,
      deletedBackups: backups,
    };
    // Zeitpunkt des Laufs ausdrücklich setzen (retentionDue richtet sich danach)
    tx.insert(auditLog).values({ at: now.toISOString(), actorUserId: null, action: 'retention.run', entity: 'database', summary: formatRetentionSummary(summary) }).run();
    return { summary, pdfFiles: inv.pdfPaths };
  };

  let result: { summary: RetentionSummary; pdfFiles: string[] };
  try {
    result = db.transaction((tx) => {
      const r = work(tx);
      if (dryRun) throw new DryRun(r);
      return r;
    });
  } catch (error) {
    if (error instanceof DryRun) return error.result.summary;
    throw error;
  }

  if (options.invoiceDir) {
    for (const relative of result.pdfFiles) {
      const file = path.resolve(options.invoiceDir, relative);
      // nur Dateien innerhalb des Beleg-Ordners
      if (!file.startsWith(path.resolve(options.invoiceDir) + path.sep)) continue;
      fs.rmSync(file, { force: true });
    }
  }
  return result.summary;
}

/** true, wenn seit dem letzten Löschlauf mindestens 23 Stunden vergangen sind (für den 5-Minuten-Zeitplan). */
export function retentionDue(db: Db, now = new Date()): boolean {
  const last = lastRetentionRun(db);
  return !last || new Date(last.at).getTime() <= now.getTime() - 23 * 3600 * 1000;
}
