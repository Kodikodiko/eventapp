/**
 * Veranstalterdaten (Rechnungspflichtangaben) und USt-Modus – genau ein Datensatz (id = 1).
 */
import { eq } from 'drizzle-orm';
import type { LocalizedText } from '@/lib/localized';
import type { Db } from '@/server/db/core';
import { organizerSettings } from '@/server/db/schema';
import { writeAudit, type Actor } from './audit';

export type OrganizerSettingsRow = typeof organizerSettings.$inferSelect;

export type OrganizerInput = {
  name: string;
  address: string;
  vatId: string | null;
  iban: string | null;
  bic: string | null;
  contactEmail: string | null;
  vatMode: 'small_business' | 'standard';
  smallBusinessNote: LocalizedText | null;
  invoicePaymentTermDays: number;
};

export const DEFAULT_SMALL_BUSINESS_NOTE: LocalizedText = {
  de: 'Umsatzsteuerfrei aufgrund der Kleinunternehmerregelung.',
  en: 'VAT exempt under the small business scheme.',
};

/** Liefert die Einstellungen; legt beim ersten Zugriff einen leeren Datensatz an. */
export function getOrganizerSettings(db: Db): OrganizerSettingsRow {
  const row = db.select().from(organizerSettings).where(eq(organizerSettings.id, 1)).get();
  if (row) return row;
  db.insert(organizerSettings).values({ id: 1, smallBusinessNote: DEFAULT_SMALL_BUSINESS_NOTE }).onConflictDoNothing().run();
  return db.select().from(organizerSettings).where(eq(organizerSettings.id, 1)).get()!;
}

export function saveOrganizerSettings(db: Db, actor: Actor, input: OrganizerInput): OrganizerSettingsRow {
  return db.transaction((tx) => {
    const before = tx.select().from(organizerSettings).where(eq(organizerSettings.id, 1)).get();
    const values = { ...input, updatedAt: new Date().toISOString() };
    tx.insert(organizerSettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: organizerSettings.id, set: values })
      .run();
    const summary =
      before && before.vatMode !== input.vatMode
        ? `Veranstalterdaten gespeichert, USt-Modus ${before.vatMode} → ${input.vatMode}`
        : 'Veranstalterdaten gespeichert';
    writeAudit(tx, actor, { action: 'organizer.updated', entity: 'organizer_settings', entityId: 1, summary });
    return tx.select().from(organizerSettings).where(eq(organizerSettings.id, 1)).get()!;
  });
}
