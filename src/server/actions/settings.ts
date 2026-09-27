'use server';

import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { legalDocumentFormSchema, organizerFormSchema } from '@/lib/validation/forms';
import { publishLegalVersion } from '@/server/services/legal';
import { saveOrganizerSettings } from '@/server/services/organizer';
import { runAdminAction } from './run';

const orNull = (v: string) => (v.trim() === '' ? null : v.trim());

export async function saveOrganizerAction(values: unknown): Promise<ActionResult<void>> {
  const parsed = organizerFormSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const v = parsed.data;
  const note = v.smallBusinessNote.de.trim()
    ? v.smallBusinessNote.en.trim()
      ? { de: v.smallBusinessNote.de.trim(), en: v.smallBusinessNote.en.trim() }
      : { de: v.smallBusinessNote.de.trim() }
    : null;
  return runAdminAction(({ actor, db }) => {
    saveOrganizerSettings(db, actor, {
      name: v.name.trim(),
      address: v.address.trim(),
      vatId: orNull(v.vatId),
      iban: orNull(v.iban)?.replace(/\s+/g, ' ').toUpperCase() ?? null,
      bic: orNull(v.bic)?.toUpperCase() ?? null,
      contactEmail: orNull(v.contactEmail)?.toLowerCase() ?? null,
      vatMode: v.vatMode,
      smallBusinessNote: note,
      invoicePaymentTermDays: Number(v.invoicePaymentTermDays),
    });
  });
}

export async function publishPrivacyAction(values: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = legalDocumentFormSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const content = parsed.data.content.en ? parsed.data.content : { de: parsed.data.content.de };
  return runAdminAction(({ actor, db }) => ({
    version: publishLegalVersion(db, actor, 'privacy', null, content).version,
  }));
}
