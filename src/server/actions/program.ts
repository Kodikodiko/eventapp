'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { sessionFormSchema, speakerFormSchema, streamFormSchema, toSessionInput, toSpeakerInput } from '@/lib/validation/program';
import {
  addStream,
  createSession,
  createSpeaker,
  deleteSession,
  deleteStream,
  moveStream,
  removeSpeaker,
  renameStream,
  updateSession,
  updateSpeaker,
} from '@/server/services/program';
import { runAdminAction } from './run';

const idSchema = z.number().int().positive();

export async function createSpeakerAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = speakerFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createSpeaker(db, actor, id.data, toSpeakerInput(parsed.data)) }));
}

export async function updateSpeakerAction(speakerId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(speakerId);
  const parsed = speakerFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateSpeaker(db, actor, id.data, toSpeakerInput(parsed.data)));
}

export async function removeSpeakerAction(speakerId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(speakerId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => removeSpeaker(db, actor, id.data));
}

export async function createSessionAction(eventId: number, values: unknown): Promise<ActionResult<{ id: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = sessionFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ id: createSession(db, actor, id.data, toSessionInput(parsed.data)) }));
}

export async function updateSessionAction(sessionId: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(sessionId);
  const parsed = sessionFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => updateSession(db, actor, id.data, toSessionInput(parsed.data)));
}

export async function deleteSessionAction(sessionId: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(sessionId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deleteSession(db, actor, id.data));
}

const positionSchema = z.number().int().min(1).max(10);
const streamName = (v: { de: string; en: string }) => (v.en.trim() ? { de: v.de.trim(), en: v.en.trim() } : { de: v.de.trim() });

export async function addStreamAction(eventId: number, values: unknown): Promise<ActionResult<{ position: number }>> {
  const id = idSchema.safeParse(eventId);
  const parsed = streamFormSchema.safeParse(values);
  if (!id.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => ({ position: addStream(db, actor, id.data, streamName(parsed.data.name)) }));
}

export async function renameStreamAction(eventId: number, position: number, values: unknown): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  const pos = positionSchema.safeParse(position);
  const parsed = streamFormSchema.safeParse(values);
  if (!id.success || !pos.success) return fail('NOT_FOUND');
  if (!parsed.success) return fail('INVALID', issuesToFieldErrors(parsed.error));
  return runAdminAction(({ actor, db }) => renameStream(db, actor, id.data, pos.data, streamName(parsed.data.name)));
}

export async function moveStreamAction(eventId: number, position: number, direction: -1 | 1): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  const pos = positionSchema.safeParse(position);
  if (!id.success || !pos.success || (direction !== -1 && direction !== 1)) return fail('INVALID');
  return runAdminAction(({ actor, db }) => moveStream(db, actor, id.data, pos.data, direction));
}

export async function deleteStreamAction(eventId: number, position: number): Promise<ActionResult<void>> {
  const id = idSchema.safeParse(eventId);
  const pos = positionSchema.safeParse(position);
  if (!id.success || !pos.success) return fail('NOT_FOUND');
  return runAdminAction(({ actor, db }) => deleteStream(db, actor, id.data, pos.data));
}
