'use server';

/** Admin-Rahmen und Teilnehmerliste: Schnellsuche, Detailpanel, Sammelaktionen. */
import { z } from 'zod';
import { fail, ServiceError, type ActionResult } from '@/lib/action-result';
import { adminSearch, type SearchHit } from '@/server/services/admin-search';
import { getRegistrationDetail, type RegistrationDetail } from '@/server/services/registration-detail';
import { addRoleToRegistrations } from '@/server/services/registrations';
import { runAdminAction, runAdminQuery } from './run';

const idSchema = z.number().int().positive();

export async function adminSearchAction(query: unknown): Promise<ActionResult<SearchHit[]>> {
  const q = z.string().max(200).safeParse(query);
  if (!q.success) return fail('INVALID');
  return runAdminQuery(({ db }) => adminSearch(db, q.data));
}

export async function registrationDetailAction(registrationId: unknown): Promise<ActionResult<RegistrationDetail>> {
  const id = idSchema.safeParse(registrationId);
  if (!id.success) return fail('NOT_FOUND');
  return runAdminQuery(({ db }) => {
    const detail = getRegistrationDetail(db, id.data);
    if (!detail) throw new ServiceError('NOT_FOUND');
    return detail;
  });
}

const bulkRoleSchema = z.object({ ids: z.array(idSchema).min(1).max(1000), role: z.string().min(1).max(40) });

export async function bulkAddRoleAction(values: unknown): Promise<ActionResult<{ changed: number }>> {
  const parsed = bulkRoleSchema.safeParse(values);
  if (!parsed.success) return fail('INVALID');
  return runAdminAction(({ actor, db }) => ({ changed: addRoleToRegistrations(db, actor, parsed.data.ids, parsed.data.role) }));
}
