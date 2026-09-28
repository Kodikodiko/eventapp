/**
 * Gemeinsamer Rahmen für Server Actions im Admin-Bereich:
 * Rechteprüfung → Ausführung → Fehler in ActionResult übersetzen.
 * (Keine 'use server'-Datei: wird nur von den Action-Dateien importiert.)
 */
import 'server-only';
import { revalidatePath } from 'next/cache';
import { fail, ok, ServiceError, type ActionResult } from '@/lib/action-result';
import { assertAdmin, ForbiddenError } from '@/server/auth/session';
import { getDb, type Db } from '@/server/db';
import type { Actor } from '@/server/services/audit';

export async function runAdminAction<T>(fn: (ctx: { actor: Actor; db: Db }) => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    const session = await assertAdmin();
    const result = await fn({ actor: { userId: session.user.id }, db: getDb() });
    // Admin-Seiten werden dynamisch gerendert; Router-Cache verwerfen, damit Listen aktuell sind
    revalidatePath('/', 'layout');
    return ok(result);
  } catch (error) {
    if (error instanceof ForbiddenError) return fail('FORBIDDEN');
    if (error instanceof ServiceError) return fail(error.code, error.fieldErrors);
    console.error('[action] Unerwarteter Fehler', error);
    return fail('UNEXPECTED');
  }
}

/** Wie runAdminAction, aber nur lesend: ohne Neuaufbau der Seiten (für Suche und Detailansichten). */
export async function runAdminQuery<T>(fn: (ctx: { db: Db }) => T | Promise<T>): Promise<ActionResult<T>> {
  try {
    await assertAdmin();
    return ok(await fn({ db: getDb() }));
  } catch (error) {
    if (error instanceof ForbiddenError) return fail('FORBIDDEN');
    if (error instanceof ServiceError) return fail(error.code, error.fieldErrors);
    console.error('[query] Unerwarteter Fehler', error);
    return fail('UNEXPECTED');
  }
}
