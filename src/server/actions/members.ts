'use server';

import { z } from 'zod';
import { fail, type ActionResult } from '@/lib/action-result';
import {
  diffMembers,
  MAX_MEMBER_ROWS,
  parseMemberFile,
  replaceMembers,
  type MemberDiff,
  type MemberParseError,
  type MemberRow,
} from '@/server/services/members';
import { runAdminAction } from './run';

export type MemberPreview = {
  fileName: string;
  rows: MemberRow[];
  errors: MemberParseError[];
  diff: MemberDiff;
};

/** Schritt 1: Datei einlesen und prüfen – ändert noch nichts. */
export async function previewMemberImportAction(formData: FormData): Promise<ActionResult<MemberPreview>> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return fail('INVALID', { file: 'required' });
  // Datei erst nach der Rechteprüfung einlesen
  return runAdminAction(async ({ db }) => {
    const parsed = await parseMemberFile(Buffer.from(await file.arrayBuffer()), file.name);
    return { fileName: file.name, rows: parsed.rows, errors: parsed.errors, diff: diffMembers(db, parsed.rows) };
  });
}

const rowSchema = z.object({
  memberNumber: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(100),
  firstName: z.string().trim().max(100).nullable(),
  email: z.string().trim().max(200).nullable(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const applySchema = z.object({
  fileName: z.string().min(1).max(200),
  rows: z
    .array(rowSchema)
    .min(1)
    .max(MAX_MEMBER_ROWS)
    .refine((rows) => new Set(rows.map((r) => r.memberNumber.toLowerCase())).size === rows.length, 'duplicate'),
});

/** Schritt 2: geprüfte Zeilen übernehmen – ersetzt die komplette Liste. */
export async function applyMemberImportAction(values: unknown): Promise<ActionResult<MemberDiff>> {
  const parsed = applySchema.safeParse(values);
  if (!parsed.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => replaceMembers(db, actor, parsed.data.rows, parsed.data.fileName));
}
