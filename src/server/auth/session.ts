/**
 * Sitzung und Rechteprüfung für Seiten, Layouts und (später) Server Actions.
 * Jede Seite und jede Aktion im Admin-Bereich prüft selbst – proxy.ts ist nur eine Vorprüfung.
 */
import 'server-only';
import { headers } from 'next/headers';
import { cache } from 'react';
import { redirect } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { getAuth, type AuthSession } from './index';

/** Aktuelle Sitzung oder null (pro Request zwischengespeichert). */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  // Zuerst die Request-Header lesen: macht die Seite dynamisch, bevor Anmeldung/Datenbank initialisiert werden
  // (sonst würde der Build beim Vorrendern die Datenbank öffnen).
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

export function isAdmin(session: AuthSession | null): session is AuthSession {
  return session?.user.role === 'admin';
}

/** Für Seiten: angemeldeter Admin, sonst Weiterleitung zum Login. */
export async function requireAdmin(locale: Locale): Promise<AuthSession> {
  const session = await getSession();
  if (!session) return redirect({ href: '/admin/login', locale });
  if (!isAdmin(session)) return redirect({ href: { pathname: '/admin/login', query: { error: 'forbidden' } }, locale });
  return session;
}

/** Für Seiten: Admin mit eingerichteter 2FA, sonst Weiterleitung zur Einrichtung. */
export async function requireAdminWith2fa(locale: Locale): Promise<AuthSession> {
  const session = await requireAdmin(locale);
  if (!session.user.twoFactorEnabled) return redirect({ href: '/admin/security', locale });
  return session;
}

export class ForbiddenError extends Error {
  constructor() {
    super('FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/** Für Server Actions und Route Handler: wirft, wenn kein Admin mit 2FA angemeldet ist. */
export async function assertAdmin(): Promise<AuthSession> {
  const session = await getSession();
  if (!isAdmin(session) || !session.user.twoFactorEnabled) throw new ForbiddenError();
  return session;
}
