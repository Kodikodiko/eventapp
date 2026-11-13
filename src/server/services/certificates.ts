/**
 * Teilnahmebestätigungen je Event (U5): Einrichtung (Hintergrundbild, Überschrift, Text de/en) und PDF für
 * ausgewählte Anmeldungen – eine Seite je angehakter Person in ihrer Sprache (unabhängig vom Status; anonymisierte ausgenommen).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import { TIME_ZONE } from '@/lib/dates';
import { localized, type LocalizedText } from '@/lib/localized';
import {
  type CertificateInput,
  DEFAULT_CERTIFICATE_BODY,
  DEFAULT_CERTIFICATE_COLOR,
  DEFAULT_CERTIFICATE_HEADING,
  fillCertificateText,
} from '@/lib/validation/certificates';
import { renderCertificatesPdf, type CertificatePage } from '@/server/certificates/pdf';
import {
  checkCertificateImage,
  type ImageUpload,
  readCertificateImage,
  removeCertificateImage,
  storeCertificateImage,
} from '@/server/certificates/storage';
import type { Db } from '@/server/db/core';
import { eventCertificates, events, people, registrations } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';
import { getOrganizerSettings } from './organizer';

type Locale = 'de' | 'en';
type EventRow = typeof events.$inferSelect;

export type CertificateSettings = {
  heading: LocalizedText;
  body: LocalizedText;
  textColor: string;
  imagePath: string | null;
  imageName: string | null;
  /** true, wenn noch nichts gespeichert wurde (Standardtexte) */
  isDefault: boolean;
};

export function getCertificateSettings(db: Db, eventId: number): CertificateSettings {
  const row = db.select().from(eventCertificates).where(eq(eventCertificates.eventId, eventId)).get();
  if (!row) {
    return { heading: DEFAULT_CERTIFICATE_HEADING, body: DEFAULT_CERTIFICATE_BODY, textColor: DEFAULT_CERTIFICATE_COLOR, imagePath: null, imageName: null, isDefault: true };
  }
  return { heading: row.heading, body: row.body, textColor: row.textColor, imagePath: row.imagePath, imageName: row.imageName, isDefault: false };
}

function loadEvent(db: Db, eventId: number): EventRow {
  const event = db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  return event;
}

/**
 * Speichert die Einrichtung. Ein neues Bild ersetzt das alte; `remove` entfernt es. Das Bild wird vorab
 * probehalber in ein PDF gesetzt, damit ein nicht lesbares Bild schon beim Hochladen auffällt.
 */
export async function saveCertificateSettings(
  db: Db,
  actor: Actor,
  eventId: number,
  input: CertificateInput,
  image: { upload: ImageUpload | null; remove: boolean }
): Promise<void> {
  const event = loadEvent(db, eventId);
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  const current = getCertificateSettings(db, eventId);
  if (image.upload) {
    checkCertificateImage(image.upload);
    try {
      await renderCertificatesPdf([{ heading: '', body: '', name: '' }], { image: image.upload.data, textColor: input.textColor, title: '', author: '' });
    } catch {
      throw new ServiceError('INVALID', { image: 'imageUnreadable' });
    }
  }
  const stored = image.upload ? storeCertificateImage(eventId, image.upload) : null;
  const keepOld = !stored && !image.remove;
  const values = {
    heading: input.heading,
    body: input.body,
    textColor: input.textColor,
    imagePath: keepOld ? current.imagePath : (stored?.imagePath ?? null),
    imageName: keepOld ? current.imageName : (stored?.imageName ?? null),
    imageType: keepOld ? undefined : (stored?.imageType ?? null),
    updatedAt: new Date().toISOString(),
  };
  try {
    db.transaction((tx) => {
      tx.insert(eventCertificates)
        .values({ eventId, ...values })
        .onConflictDoUpdate({ target: eventCertificates.eventId, set: values })
        .run();
      writeAudit(tx, actor, {
        action: 'certificate.updated',
        entity: 'event',
        entityId: eventId,
        eventId,
        summary: `Teilnahmebestätigung eingerichtet${stored ? ' (neues Hintergrundbild)' : image.remove && current.imagePath ? ' (Hintergrundbild entfernt)' : ''}`,
      });
    });
  } catch (error) {
    if (stored) removeCertificateImage(stored.imagePath);
    throw error;
  }
  if (!keepOld && current.imagePath) removeCertificateImage(current.imagePath);
}

/** Einrichtung beim Kopieren eines Events übernehmen (das Bild wird als eigene Datei kopiert). */
export function copyCertificate(tx: Tx, sourceId: number, targetId: number): void {
  const row = tx.select().from(eventCertificates).where(eq(eventCertificates.eventId, sourceId)).get();
  if (!row) return;
  const data = readCertificateImage(row.imagePath);
  const stored = data && row.imageName ? storeCertificateImage(targetId, { fileName: row.imageName, data }) : null;
  tx.insert(eventCertificates)
    .values({
      eventId: targetId,
      heading: row.heading,
      body: row.body,
      textColor: row.textColor,
      imagePath: stored?.imagePath ?? null,
      imageName: stored?.imageName ?? null,
      imageType: stored?.imageType ?? null,
    })
    .run();
}

/** Uhrzeit Beginn bis Ende laut Event, z. B. „08:00 bis 18:00 Uhr“ bzw. „08:00–18:00“ (englisch). */
export function certificateTime(event: Pick<EventRow, 'startsAt' | 'endsAt'>, locale: Locale): string {
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-AT', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIME_ZONE });
  const from = format.format(new Date(event.startsAt));
  const to = format.format(new Date(event.endsAt));
  return locale === 'en' ? `${from}–${to}` : `${from} bis ${to} Uhr`;
}

/** Datum des Events in der Sprache der Person, z. B. „12. Mai 2027“ oder „12.–13. Mai 2027“. */
export function certificateDate(event: Pick<EventRow, 'startsAt' | 'endsAt'>, locale: Locale): string {
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-AT', { dateStyle: 'long', timeZone: TIME_ZONE });
  return format.formatRange(new Date(event.startsAt), new Date(event.endsAt));
}

function pageFor(settings: CertificateSettings, event: EventRow, person: { name: string; locale: Locale }): CertificatePage {
  const values = { name: person.name, event: localized(event.name, person.locale), datum: certificateDate(event, person.locale), uhrzeit: certificateTime(event, person.locale), ort: event.location };
  return {
    heading: fillCertificateText(localized(settings.heading, person.locale), values),
    body: fillCertificateText(localized(settings.body, person.locale), values),
    name: person.name,
    event: values.event,
  };
}

async function render(db: Db, event: EventRow, settings: CertificateSettings, pages: CertificatePage[], title: string) {
  const image = readCertificateImage(settings.imagePath);
  return renderCertificatesPdf(pages, { image, textColor: settings.textColor, title, author: getOrganizerSettings(db).name || 'EventFlow' });
}

/** Vorschau mit Beispielnamen in der gewünschten Sprache. */
export async function certificatePreviewPdf(db: Db, eventId: number, locale: Locale): Promise<Buffer> {
  const event = loadEvent(db, eventId);
  const settings = getCertificateSettings(db, eventId);
  const name = locale === 'en' ? 'Jane Example' : 'Maria Muster';
  return render(db, event, settings, [pageFor(settings, event, { name, locale })], localized(settings.heading, locale));
}

/**
 * PDF für die gewählten Anmeldungen des Events (Reihenfolge Nachname, Vorname).
 * Liefert null, wenn keine Anmeldung des Events dabei ist.
 */
export async function certificatesPdf(db: Db, actor: Actor, eventId: number, registrationIds: number[]): Promise<{ pdf: Buffer; count: number } | null> {
  const event = loadEvent(db, eventId);
  const ids = [...new Set(registrationIds)].filter((id) => Number.isSafeInteger(id) && id > 0);
  if (ids.length === 0) return null;
  const rows = db
    .select({ id: registrations.id, firstName: people.firstName, lastName: people.lastName, locale: people.locale, anonymizedAt: people.anonymizedAt })
    .from(registrations)
    .innerJoin(people, eq(people.id, registrations.personId))
    .where(and(eq(registrations.eventId, eventId), inArray(registrations.id, ids)))
    .all()
    .filter((r) => !r.anonymizedAt)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
  if (rows.length === 0) return null;
  const settings = getCertificateSettings(db, eventId);
  const pages = rows.map((r) => pageFor(settings, event, { name: `${r.firstName} ${r.lastName}`.trim(), locale: r.locale }));
  const pdf = await render(db, event, settings, pages, localized(settings.heading, 'de'));
  writeAudit(db, actor, {
    action: 'certificate.generated',
    entity: 'event',
    entityId: eventId,
    eventId,
    summary: `Teilnahmebestätigung (PDF) für ${rows.length} ${rows.length === 1 ? 'Person' : 'Personen'}`,
  });
  return { pdf, count: rows.length };
}
