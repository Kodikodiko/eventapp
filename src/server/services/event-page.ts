/**
 * Eventseite (W3): Motto, Nutzen-Blöcke, Titelbild und Galerie je Event sowie Speaker-Fotos und Sponsor-Logos.
 * Bilder liegen unter MEDIA_DIR (siehe server/media/storage); ersetzte oder gelöschte Bilder werden entfernt.
 */
import { and, asc, desc, eq, gt, lt, max } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { EventPageInput } from '@/lib/validation/event-page';
import type { Db } from '@/server/db/core';
import { eventGalleryImages, events, speakers, sponsors } from '@/server/db/schema';
import { copyMediaImage, removeMediaImage, storeMediaImage, type MediaUpload, type StoredMedia } from '@/server/media/storage';
import { writeAudit, type Actor, type Tx } from './audit';

export const MAX_GALLERY_IMAGES = 24;

export type GalleryImage = { id: number; imagePath: string; imageName: string };

export type EventPageSettings = EventPageInput & {
  heroImagePath: string | null;
  heroImageName: string | null;
  logoPath: string | null;
  logoName: string | null;
  gallery: GalleryImage[];
};

/** Bilder beim Speichern der Eventseite: neues Bild ersetzt das alte, `remove` entfernt es; `icons` je gespeichertem Nutzen-Block. */
export type EventPageMedia = {
  hero?: { upload: MediaUpload | null; remove: boolean };
  logo?: { upload: MediaUpload | null; remove: boolean };
  icons?: (MediaUpload | null)[];
};

function loadWritableEvent(tx: Tx | Db, eventId: number) {
  const event = tx.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  return event;
}

export function listGallery(db: Db | Tx, eventId: number): GalleryImage[] {
  return db
    .select({ id: eventGalleryImages.id, imagePath: eventGalleryImages.imagePath, imageName: eventGalleryImages.imageName })
    .from(eventGalleryImages)
    .where(eq(eventGalleryImages.eventId, eventId))
    .orderBy(asc(eventGalleryImages.sortOrder), asc(eventGalleryImages.id))
    .all();
}

export function getEventPageSettings(db: Db, eventId: number): EventPageSettings {
  const event = db.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  return {
    tagline: event.tagline ?? null,
    highlights: event.highlights ?? [],
    theme: event.theme ?? null,
    heroImagePath: event.heroImagePath,
    heroImageName: event.heroImageName,
    logoPath: event.logoPath,
    logoName: event.logoName,
    gallery: listGallery(db, eventId),
  };
}

/**
 * Motto, Farben und Nutzen-Blöcke speichern, dazu Titelbild, Logo und Icons.
 * Ein Icon bleibt nur erhalten, wenn sein Pfad schon zu diesem Event gehört (keine fremden Dateien übernehmen).
 */
export function saveEventPage(db: Db, actor: Actor, eventId: number, input: EventPageInput, media: EventPageMedia = {}): void {
  const event = loadWritableEvent(db, eventId);
  const oldIcons = new Set((event.highlights ?? []).map((h) => h.iconPath).filter((p): p is string => Boolean(p)));
  const stored: StoredMedia[] = [];
  const store = (upload: MediaUpload, field: string) => {
    const s = storeMediaImage(eventId, upload, field);
    stored.push(s);
    return s;
  };
  try {
    const hero = media.hero?.upload ? store(media.hero.upload, 'heroImage') : null;
    const logo = media.logo?.upload ? store(media.logo.upload, 'logo') : null;
    const replaceHero = Boolean(hero) || Boolean(media.hero?.remove);
    const replaceLogo = Boolean(logo) || Boolean(media.logo?.remove);
    const highlights = input.highlights.map((h, i) => {
      const upload = media.icons?.[i];
      const iconPath = upload ? store(upload, `highlights.${i}.icon`).path : h.iconPath && oldIcons.has(h.iconPath) ? h.iconPath : null;
      return { title: h.title, text: h.text, ...(iconPath ? { iconPath } : {}) };
    });
    db.transaction((tx) => {
      tx.update(events)
        .set({
          tagline: input.tagline,
          highlights,
          ...(input.theme !== undefined ? { theme: input.theme } : {}),
          ...(replaceHero ? { heroImagePath: hero?.path ?? null, heroImageName: hero?.name ?? null } : {}),
          ...(replaceLogo ? { logoPath: logo?.path ?? null, logoName: logo?.name ?? null } : {}),
        })
        .where(eq(events.id, eventId))
        .run();
      const notes = [
        hero ? 'neues Titelbild' : replaceHero && event.heroImagePath ? 'Titelbild entfernt' : null,
        logo ? 'neues Logo' : replaceLogo && event.logoPath ? 'Logo entfernt' : null,
      ].filter(Boolean);
      writeAudit(tx, actor, {
        action: 'event_page.updated',
        entity: 'event',
        entityId: eventId,
        eventId,
        summary: `Eventseite gespeichert${notes.length ? ` (${notes.join(', ')})` : ''}`,
      });
    });
    if (replaceHero) removeMediaImage(event.heroImagePath);
    if (replaceLogo) removeMediaImage(event.logoPath);
    const kept = new Set(highlights.map((h) => h.iconPath).filter(Boolean));
    for (const p of oldIcons) if (!kept.has(p)) removeMediaImage(p);
  } catch (error) {
    for (const s of stored) removeMediaImage(s.path);
    throw error;
  }
}

export function addGalleryImages(db: Db, actor: Actor, eventId: number, uploads: MediaUpload[]): number {
  loadWritableEvent(db, eventId);
  if (uploads.length === 0) return 0;
  const existing = listGallery(db, eventId).length;
  if (existing + uploads.length > MAX_GALLERY_IMAGES) throw new ServiceError('INVALID', { images: 'galleryFull' });
  const stored: StoredMedia[] = [];
  try {
    for (const u of uploads) stored.push(storeMediaImage(eventId, u, 'images'));
    db.transaction((tx) => {
      const start =
        (tx
          .select({ m: max(eventGalleryImages.sortOrder) })
          .from(eventGalleryImages)
          .where(eq(eventGalleryImages.eventId, eventId))
          .get()?.m ?? 0) + 1;
      tx.insert(eventGalleryImages)
        .values(stored.map((s, i) => ({ eventId, imagePath: s.path, imageName: s.name, sortOrder: start + i })))
        .run();
      writeAudit(tx, actor, {
        action: 'gallery.added',
        entity: 'event',
        entityId: eventId,
        eventId,
        summary: `${stored.length} Bild(er) zur Galerie hinzugefügt`,
      });
    });
  } catch (error) {
    for (const s of stored) removeMediaImage(s.path);
    throw error;
  }
  return stored.length;
}

export function deleteGalleryImage(db: Db, actor: Actor, id: number): void {
  const row = db.select().from(eventGalleryImages).where(eq(eventGalleryImages.id, id)).get();
  if (!row) throw new ServiceError('NOT_FOUND');
  loadWritableEvent(db, row.eventId);
  db.transaction((tx) => {
    tx.delete(eventGalleryImages).where(eq(eventGalleryImages.id, id)).run();
    writeAudit(tx, actor, {
      action: 'gallery.deleted',
      entity: 'event',
      entityId: row.eventId,
      eventId: row.eventId,
      summary: `Galeriebild ${row.imageName} gelöscht`,
    });
  });
  removeMediaImage(row.imagePath);
}

/** Galeriebild eine Stelle nach vorne (-1) oder hinten (+1) schieben. */
export function moveGalleryImage(db: Db, actor: Actor, id: number, direction: -1 | 1): void {
  db.transaction((tx) => {
    const row = tx.select().from(eventGalleryImages).where(eq(eventGalleryImages.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, row.eventId);
    const neighbour = tx
      .select()
      .from(eventGalleryImages)
      .where(
        and(
          eq(eventGalleryImages.eventId, row.eventId),
          direction < 0 ? lt(eventGalleryImages.sortOrder, row.sortOrder) : gt(eventGalleryImages.sortOrder, row.sortOrder)
        )
      )
      .orderBy(direction < 0 ? desc(eventGalleryImages.sortOrder) : asc(eventGalleryImages.sortOrder))
      .get();
    if (!neighbour) return;
    tx.update(eventGalleryImages).set({ sortOrder: neighbour.sortOrder }).where(eq(eventGalleryImages.id, row.id)).run();
    tx.update(eventGalleryImages).set({ sortOrder: row.sortOrder }).where(eq(eventGalleryImages.id, neighbour.id)).run();
    writeAudit(tx, actor, {
      action: 'gallery.moved',
      entity: 'event',
      entityId: row.eventId,
      eventId: row.eventId,
      summary: 'Reihenfolge der Galerie geändert',
    });
  });
}

/** Speaker-Foto setzen (upload) oder entfernen (null). */
export function setSpeakerPhoto(db: Db, actor: Actor, speakerId: number, upload: MediaUpload | null): void {
  const sp = db.select().from(speakers).where(eq(speakers.id, speakerId)).get();
  if (!sp) throw new ServiceError('NOT_FOUND');
  loadWritableEvent(db, sp.eventId);
  const stored = upload ? storeMediaImage(sp.eventId, upload) : null;
  try {
    db.transaction((tx) => {
      tx.update(speakers)
        .set({ photoPath: stored?.path ?? null })
        .where(eq(speakers.id, speakerId))
        .run();
      writeAudit(tx, actor, {
        action: 'speaker.photo',
        entity: 'speaker',
        entityId: speakerId,
        eventId: sp.eventId,
        summary: stored ? 'Foto hochgeladen' : 'Foto entfernt',
      });
    });
  } catch (error) {
    if (stored) removeMediaImage(stored.path);
    throw error;
  }
  removeMediaImage(sp.photoPath);
}

/** Sponsor-Logo setzen (upload) oder entfernen (null). */
export function setSponsorLogo(db: Db, actor: Actor, sponsorId: number, upload: MediaUpload | null): void {
  const sp = db.select().from(sponsors).where(eq(sponsors.id, sponsorId)).get();
  if (!sp) throw new ServiceError('NOT_FOUND');
  loadWritableEvent(db, sp.eventId);
  const stored = upload ? storeMediaImage(sp.eventId, upload) : null;
  try {
    db.transaction((tx) => {
      tx.update(sponsors)
        .set({ logoPath: stored?.path ?? null })
        .where(eq(sponsors.id, sponsorId))
        .run();
      writeAudit(tx, actor, {
        action: 'sponsor.logo',
        entity: 'sponsor',
        entityId: sponsorId,
        eventId: sp.eventId,
        summary: stored ? `Logo ${sp.companyName} hochgeladen` : `Logo ${sp.companyName} entfernt`,
      });
    });
  } catch (error) {
    if (stored) removeMediaImage(stored.path);
    throw error;
  }
  removeMediaImage(sp.logoPath);
}

/** Beim Kopieren eines Events: Titelbild, Logo, Icons und Galerie als eigene Dateien übernehmen (Motto, Farben und Texte kopiert copyEvent mit). */
export function copyEventPageMedia(tx: Tx, sourceId: number, targetId: number): void {
  const source = tx.select().from(events).where(eq(events.id, sourceId)).get();
  const hero = source ? copyMediaImage(source.heroImagePath, source.heroImageName, targetId) : null;
  const logo = source ? copyMediaImage(source.logoPath, source.logoName, targetId) : null;
  const highlights = (source?.highlights ?? []).map((h) => {
    const icon = copyMediaImage(h.iconPath, null, targetId);
    return { title: h.title, text: h.text, ...(icon ? { iconPath: icon.path } : {}) };
  });
  tx.update(events)
    .set({ heroImagePath: hero?.path ?? null, heroImageName: hero?.name ?? null, logoPath: logo?.path ?? null, logoName: logo?.name ?? null, highlights })
    .where(eq(events.id, targetId))
    .run();
  const rows = tx.select().from(eventGalleryImages).where(eq(eventGalleryImages.eventId, sourceId)).orderBy(asc(eventGalleryImages.sortOrder)).all();
  const copies = rows.flatMap((r) => {
    const c = copyMediaImage(r.imagePath, r.imageName, targetId);
    return c ? [{ eventId: targetId, imagePath: c.path, imageName: c.name, sortOrder: r.sortOrder }] : [];
  });
  if (copies.length) tx.insert(eventGalleryImages).values(copies).run();
}
