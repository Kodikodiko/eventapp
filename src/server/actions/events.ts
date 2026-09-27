'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { copyEventSchema, eventFormSchema, legalDocumentFormSchema, toEventInput } from '@/lib/validation/forms';
import { copyEvent, createEvent, setEventArchived, updateEvent } from '@/server/services/events';
import { publishLegalVersion } from '@/server/services/legal';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

export async function createEventAction(values: unknown): Promise<ActionResult<{ id: number }>> {
  const parsed = eventFormSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createEvent(db, actor, toEventInput(parsed.data)).id }));
}

export async function updateEventAction(id: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const parsedId = idSchema.safeParse(id);
  const parsed = eventFormSchema.safeParse(values);
  if (!parsedId.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: updateEvent(db, actor, parsedId.data, toEventInput(parsed.data)).id }));
}

export async function copyEventAction(sourceId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const parsedId = idSchema.safeParse(sourceId);
  const parsed = copyEventSchema.safeParse(values);
  if (!parsedId.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const name = parsed.data.name.en ? parsed.data.name : { de: parsed.data.name.de };
  return runAdminAction(({ actor, db }) => ({
    id: copyEvent(db, actor, parsedId.data, { slug: parsed.data.slug, name }).id,
  }));
}

export async function setEventArchivedAction(id: number, archived: boolean): Promise<ActionResult<void>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success || typeof archived !== 'boolean') return fail('INVALID');
  return runAdminAction(({ actor, db }) => {
    setEventArchived(db, actor, parsedId.data, archived);
  });
}

export async function publishTermsAction(eventId: number, values: unknown): Promise<ActionResult<{ version: number }>> {
  const parsedId = idSchema.safeParse(eventId);
  const parsed = legalDocumentFormSchema.safeParse(values);
  if (!parsedId.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  const content = parsed.data.content.en ? parsed.data.content : { de: parsed.data.content.de };
  return runAdminAction(({ actor, db }) => ({
    version: publishLegalVersion(db, actor, 'terms', parsedId.data, content).version,
  }));
}
