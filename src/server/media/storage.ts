/**
 * Ablage der Bilder für die öffentliche Eventseite (Titelbild, Galerie, Speaker-Fotos, Sponsor-Logos):
 * MEDIA_DIR (Standard data/media, nicht im Git), Unterordner je Event, Dateiname zufällig.
 * Erlaubt sind PNG, JPG und WebP (Endung und Dateiinhalt werden geprüft). Ausgeliefert über /api/media/….
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ServiceError } from '@/lib/action-result';
import { MAX_MEDIA_IMAGE_BYTES, MEDIA_IMAGE_TYPES, mediaImageExtension } from '@/lib/validation/media';

export type MediaUpload = { fileName: string; data: Buffer };
export type StoredMedia = { path: string; name: string };

export function mediaDir(): string {
  const custom = process.env.MEDIA_DIR?.trim();
  return custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(process.cwd(), 'data', 'media');
}

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export function checkMediaImage(upload: MediaUpload, field = 'image'): { ext: string; type: string } {
  const ext = mediaImageExtension(upload.fileName);
  if (!ext) throw new ServiceError('INVALID', { [field]: 'mediaType' });
  if (upload.data.length === 0 || upload.data.length > MAX_MEDIA_IMAGE_BYTES) throw new ServiceError('INVALID', { [field]: 'imageTooLarge' });
  const type = MEDIA_IMAGE_TYPES[ext];
  if (!SIGNATURES[type](upload.data)) throw new ServiceError('INVALID', { [field]: 'mediaType' });
  return { ext: ext === 'jpeg' ? 'jpg' : ext, type };
}

export function storeMediaImage(eventId: number, upload: MediaUpload, field = 'image'): StoredMedia {
  const { ext } = checkMediaImage(upload, field);
  const relative = path.posix.join(String(eventId), `${randomUUID()}.${ext}`);
  const file = path.join(mediaDir(), relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, upload.data, { flag: 'wx' });
  const name = path.basename(upload.fileName.replace(/\\/g, '/')).slice(0, 200) || `bild.${ext}`;
  return { path: relative, name };
}

/** Nur Pfade der Form „<eventId>/<uuid>.<ext>“ – schützt vor Pfaden außerhalb der Ablage. */
const RELATIVE_PATTERN = /^\d+\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

function resolveInDir(relative: string): string | null {
  if (!RELATIVE_PATTERN.test(relative)) return null;
  const base = mediaDir();
  const file = path.resolve(base, relative);
  return file.startsWith(base + path.sep) ? file : null;
}

export function readMediaImage(relative: string | null | undefined): { data: Buffer; type: string } | null {
  if (!relative) return null;
  const file = resolveInDir(relative);
  if (!file) return null;
  try {
    const ext = relative.split('.').pop() as 'png' | 'jpg' | 'webp';
    return { data: fs.readFileSync(file), type: MEDIA_IMAGE_TYPES[ext] };
  } catch {
    return null;
  }
}

/** Bild als eigene Datei für ein anderes Event kopieren (Event kopieren). */
export function copyMediaImage(relative: string | null | undefined, name: string | null | undefined, targetEventId: number): StoredMedia | null {
  const image = readMediaImage(relative);
  if (!image || !relative) return null;
  return storeMediaImage(targetEventId, { fileName: name || path.posix.basename(relative), data: image.data });
}

export function removeMediaImage(relative: string | null | undefined): void {
  if (!relative) return;
  const file = resolveInDir(relative);
  if (!file) return;
  try {
    fs.rmSync(file, { force: true });
  } catch (error) {
    console.warn('[media] Bild konnte nicht entfernt werden', relative, error);
  }
}
