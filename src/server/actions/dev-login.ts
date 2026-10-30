'use server';

/** Entwickler-Login (DEV_LOGIN, nur unter localhost): Benutzername + Passwort statt E-Mail + 2FA. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { headers } from 'next/headers';
import { z } from 'zod';
import { fail, ok, type ActionResult } from '@/lib/action-result';
import { getAuth } from '@/server/auth';
import { upsertAdmin } from '@/server/auth/admin-users';
import { devLoginConfig, devLoginEmail } from '@/server/auth/two-factor-policy';
import { requestDb } from '@/server/db';

const input = z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(200) });

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function devSignInAction(values: unknown): Promise<ActionResult<void>> {
  const config = devLoginConfig();
  if (!config) return fail('FORBIDDEN');
  const parsed = input.safeParse(values);
  if (!parsed.success) return fail('INVALID');
  const okUser = sameText(parsed.data.username.trim().toLowerCase(), config.username);
  const okPassword = sameText(parsed.data.password, config.password);
  if (!okUser || !okPassword) return fail('FORBIDDEN');

  // Das Konto dahinter hat ein langes, aus dem Secret abgeleitetes Passwort (Mindestlänge von Better Auth)
  const db = await requestDb();
  const email = devLoginEmail(config.username);
  const password = createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? '').update(`dev-login:${email}`).digest('hex');
  const signIn = async () => getAuth().api.signInEmail({ body: { email, password }, headers: await headers() });
  try {
    try {
      await signIn();
    } catch {
      // erstes Mal oder anderes BETTER_AUTH_SECRET: Konto anlegen bzw. Passwort neu ableiten
      await upsertAdmin(db, { email, name: config.username, password }, { resetPassword: true });
      await signIn();
    }
    return ok();
  } catch (error) {
    console.error('[dev-login] Anmeldung fehlgeschlagen', error instanceof Error ? error.message : error);
    return fail('UNEXPECTED');
  }
}
