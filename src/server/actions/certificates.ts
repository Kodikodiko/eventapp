'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { certificateFormSchema, toCertificateInput } from '@/lib/validation/certificates';
import { saveCertificateSettings } from '@/server/services/certificates';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

/** Einrichtung der Teilnahmebestätigung: Formularwerte als JSON im Feld „values“, Bild optional im Feld „image“. */
export async function saveCertificateAction(eventId: number, formData: FormData): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  if (!id.success) return fail('NOT_FOUND');
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('values') ?? ''));
  } catch {
    return fail('INVALID');
  }
  const parsed = certificateFormSchema.safeParse(raw);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const file = formData.get('image');
  const image = file instanceof File && file.size > 0 ? file : null;
  // Datei erst nach der Rechteprüfung einlesen
  return runAdminAction(async ({ actor, db }) =>
    saveCertificateSettings(db, actor, id.data, toCertificateInput(parsed.data), {
      upload: image ? { fileName: image.name, data: Buffer.from(await image.arrayBuffer()) } : null,
      remove: parsed.data.removeImage,
    })
  );
}
