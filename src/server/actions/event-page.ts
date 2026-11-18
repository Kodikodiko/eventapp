'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { eventPageFormSchema, keptHighlightSlots, toEventPageInput } from '@/lib/validation/event-page';
import type { MediaUpload } from '@/server/media/storage';
import { addGalleryImages, deleteGalleryImage, moveGalleryImage, saveEventPage, setSpeakerPhoto, setSponsorLogo } from '@/server/services/event-page';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

function fileOf(formData: FormData, key: string): File | null {
  const file = formData.get(key);
  return file instanceof File && file.size > 0 ? file : null;
}

async function toUpload(file: File): Promise<MediaUpload> {
  return { fileName: file.name, data: Buffer.from(await file.arrayBuffer()) };
}

/** Eventseite: Formularwerte als JSON im Feld „values“, Bilder optional in „heroImage“, „logo“ und „highlightIcon<n>“ (n = Formular-Position). */
export async function saveEventPageAction(eventId: number, formData: FormData): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return fail('NOT_FOUND');
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('values') ?? ''));
  } catch {
    return fail('INVALID');
  }
  const parsed = eventPageFormSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const hero = fileOf(formData, 'heroImage');
  const logo = fileOf(formData, 'logo');
  const icons = keptHighlightSlots(parsed.data).map((slot) => fileOf(formData, `highlightIcon${slot}`));
  // Dateien erst nach der Rechteprüfung einlesen
  return runAdminAction(async ({ actor, db }) =>
    saveEventPage(db, actor, id.data, toEventPageInput(parsed.data), {
      hero: { upload: hero ? await toUpload(hero) : null, remove: parsed.data.removeHero },
      logo: { upload: logo ? await toUpload(logo) : null, remove: parsed.data.removeLogo },
      icons: await Promise.all(icons.map((f) => (f ? toUpload(f) : null))),
    })
  );
}

/** Ein Galeriebild im Feld „image“ (der Browser lädt mehrere Bilder nacheinander hoch). */
export async function addGalleryImageAction(eventId: number, formData: FormData): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return fail('NOT_FOUND');
  const image = fileOf(formData, 'image');
  if (!image) return fail('INVALID', { images: 'required' });
  return runAdminAction(async ({ actor, db }) => {
    addGalleryImages(db, actor, id.data, [await toUpload(image)]);
  });
}

export async function deleteGalleryImageAction(imageId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(imageId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deleteGalleryImage(db, actor, id.data));
}

export async function moveGalleryImageAction(imageId: number, direction: -1 | 1): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(imageId);
  if (!id.success || (direction !== -1 && direction !== 1)) return fail('INVALID');
  return runAdminAction(({ actor, db }) => moveGalleryImage(db, actor, id.data, direction));
}

/** Speaker-Foto: Bild im Feld „image“; ohne Bild wird das Foto entfernt. */
export async function setSpeakerPhotoAction(speakerId: number, formData: FormData): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(speakerId);
  if (!id.success) return fail('NOT_FOUND');
  const image = fileOf(formData, 'image');
  return runAdminAction(async ({ actor, db }) => setSpeakerPhoto(db, actor, id.data, image ? await toUpload(image) : null));
}

/** Sponsor-Logo: Bild im Feld „image“; ohne Bild wird das Logo entfernt. */
export async function setSponsorLogoAction(sponsorId: number, formData: FormData): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(sponsorId);
  if (!id.success) return fail('NOT_FOUND');
  const image = fileOf(formData, 'image');
  return runAdminAction(async ({ actor, db }) => setSponsorLogo(db, actor, id.data, image ? await toUpload(image) : null));
}
