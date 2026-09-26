/**
 * Admin-Konten anlegen und Passwörter setzen – genutzt von `npm run admin:create` und von Tests.
 * Admins haben ein Passwort-Konto (providerId 'credential') wie bei Better Auth üblich.
 */
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/db/core';
import { auditLog, authAccounts, authUsers } from '@/server/db/schema';
import { MIN_PASSWORD_LENGTH } from './config';

export type AdminInput = { email: string; name: string; password: string };

export function validateAdminInput(input: AdminInput): string[] {
  const problems: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) problems.push('Ungültige E-Mail-Adresse.');
  if (input.name.trim().length < 2) problems.push('Name muss mindestens 2 Zeichen haben.');
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`);
  }
  return problems;
}

/**
 * Legt einen Admin an oder – bei vorhandener E-Mail und resetPassword – setzt dessen Passwort neu.
 * Rückgabe: 'created' | 'password_reset'
 */
export async function upsertAdmin(
  db: Db,
  input: AdminInput,
  options: { resetPassword?: boolean } = {}
): Promise<'created' | 'password_reset'> {
  const problems = validateAdminInput(input);
  if (problems.length > 0) throw new Error(problems.join(' '));

  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  const existing = db.select().from(authUsers).where(eq(authUsers.email, email)).get();

  if (existing) {
    if (!options.resetPassword) {
      throw new Error(`Es gibt bereits ein Konto mit ${email}. Zum Zurücksetzen des Passworts --reset-password angeben.`);
    }
    db.transaction((tx) => {
      tx.update(authUsers).set({ role: 'admin', updatedAt: new Date() }).where(eq(authUsers.id, existing.id)).run();
      const account = tx
        .select()
        .from(authAccounts)
        .where(and(eq(authAccounts.userId, existing.id), eq(authAccounts.providerId, 'credential')))
        .get();
      if (account) {
        tx.update(authAccounts).set({ password: passwordHash, updatedAt: new Date() }).where(eq(authAccounts.id, account.id)).run();
      } else {
        tx.insert(authAccounts)
          .values({ id: randomUUID(), accountId: existing.id, providerId: 'credential', userId: existing.id, password: passwordHash })
          .run();
      }
      tx.insert(auditLog).values({ action: 'admin.password_reset', entity: 'auth_user', entityId: existing.id, summary: 'Admin-Passwort per Skript neu gesetzt' }).run();
    });
    return 'password_reset';
  }

  const userId = randomUUID();
  db.transaction((tx) => {
    tx.insert(authUsers)
      .values({ id: userId, name: input.name.trim(), email, emailVerified: true, role: 'admin', twoFactorEnabled: false })
      .run();
    tx.insert(authAccounts)
      .values({ id: randomUUID(), accountId: userId, providerId: 'credential', userId, password: passwordHash })
      .run();
    tx.insert(auditLog).values({ action: 'admin.created', entity: 'auth_user', entityId: userId, summary: 'Admin per Skript angelegt' }).run();
  });
  return 'created';
}
