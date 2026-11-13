/**
 * Ablage der Hintergrundbilder für Teilnahmebestätigungen: CERTIFICATE_DIR (Standard data/certificates, nicht im Git),
 * Dateiname je Event zufällig. Erlaubt sind PNG und JPG (Endung und Dateiinhalt werden geprüft).
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ServiceError } from '@/lib/action-result';
import { CERTIFICATE_IMAGE_TYPES, certificateImageExtension, MAX_CERTIFICATE_IMAGE_BYTES } from '@/lib/validation/certificates';

export type ImageUpload = { fileName: string; data: Buffer };
export type StoredImage = { imagePath: string; imageName: string; imageType: string };

export function certificateDir(): string {
  const custom = process.env.CERTIFICATE_DIR?.trim();
  return custom ? path.resolve(/*turbopackIgnore: true*/ custom) : path.join(process.cwd(), 'data', 'certificates');
}

const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
};

export function checkCertificateImage(upload: ImageUpload): { ext: string; type: string } {
  const ext = certificateImageExtension(upload.fileName);
  if (!ext) throw new ServiceError('INVALID', { image: 'imageType' });
  if (upload.data.length === 0 || upload.data.length > MAX_CERTIFICATE_IMAGE_BYTES) throw new ServiceError('INVALID', { image: 'imageTooLarge' });
  const type = CERTIFICATE_IMAGE_TYPES[ext];
  if (!SIGNATURES[type](upload.data)) throw new ServiceError('INVALID', { image: 'imageType' });
  return { ext, type };
}

export function storeCertificateImage(eventId: number, upload: ImageUpload): StoredImage {
  const { ext, type } = checkCertificateImage(upload);
  const relative = path.posix.join(String(eventId), `${randomUUID()}.${ext}`);
  const file = path.join(certificateDir(), relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, upload.data, { flag: 'wx' });
  const imageName = path.basename(upload.fileName.replace(/\\/g, '/')).slice(0, 200) || `hintergrund.${ext}`;
  return { imagePath: relative, imageName, imageType: type };
}

function resolveInDir(relative: string): string {
  const base = certificateDir();
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep)) throw new Error(`Ungültiger Bildpfad: ${relative}`);
  return file;
}

export function readCertificateImage(relative: string | null | undefined): Buffer | null {
  if (!relative) return null;
  try {
    return fs.readFileSync(resolveInDir(relative));
  } catch {
    return null;
  }
}

export function removeCertificateImage(relative: string | null | undefined): void {
  if (!relative) return;
  try {
    fs.rmSync(resolveInDir(relative), { force: true });
  } catch (error) {
    console.warn('[certificates] Bild konnte nicht entfernt werden', relative, error);
  }
}
