'use server';

import { z } from 'zod';
import { fail, issuesToFieldErrors, type ActionResult } from '@/lib/action-result';
import { sessionFormSchema, speakerFormSchema, toSessionInput, toSpeakerInput } from '@/lib/validation/program';
import {
  createSession,
  createSpeaker,
  deleteSession,
  removeSpeaker,
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
