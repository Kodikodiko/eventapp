/**
 * Better-Auth-Konfiguration als Fabrik (ohne Next.js-Abhängigkeiten, damit Tests sie nutzen können).
 * Die App verwendet getAuth() aus ./index.ts.
 */
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { magicLink, twoFactor } from 'better-auth/plugins';
import type { Db } from '@/server/db/core';
import { authAccounts, authSessions, authTwoFactors, authUsers, authVerifications } from '@/server/db/schema';

export const MIN_PASSWORD_LENGTH = 12;

export type CreateAuthOptions = {
  secret: string;
  baseURL: string;
  /** nur innerhalb von Next.js aktivieren (setzt Cookies aus Server Actions) */
  withNextCookies?: boolean;
  /**
   * Versand des Anmeldelinks für das Teilnehmerportal. Muss selbst prüfen, dass die Adresse zu einem
   * Teilnehmer-Konto gehört – Admins melden sich nie per Link an (sonst ohne Zwei-Faktor).
   */
  sendPortalLink?: (data: { email: string; url: string }) => Promise<void>;
};

/** Gültigkeit des Anmeldelinks (Sekunden). */
export const PORTAL_LINK_TTL_SECONDS = 15 * 60;

export function createAuth(db: Db, options: CreateAuthOptions) {
  return betterAuth({
    appName: 'EventFlow',
    secret: options.secret,
    baseURL: options.baseURL,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
        twoFactor: authTwoFactors,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Admins werden nur per `npm run admin:create` angelegt, keine Selbstregistrierung
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'attendee', input: false },
        personId: { type: 'number', required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 8, // 8 Stunden
      updateAge: 60 * 60, // Verlängerung höchstens stündlich
    },
    hooks: {
      // Link-Anmeldung nur für vorhandene Teilnehmer-Konten: für alle anderen Adressen (Admins, Unbekannte) wird
      // gar kein Token erzeugt. Die Antwort ist gleich, damit sich Adressen nicht ausforschen lassen.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/magic-link') return;
        const email = String((ctx.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase();
        const user = db.select({ role: authUsers.role, personId: authUsers.personId }).from(authUsers).where(eq(authUsers.email, email)).get();
        if (!user || user.role !== 'attendee' || user.personId == null) return ctx.json({ status: true });
      }),
      // Zweite Sicherung: eine Link-Anmeldung darf nie eine Sitzung für ein Nicht-Teilnehmer-Konto ergeben
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/magic-link/verify') return;
        const created = ctx.context.newSession;
        if (created && (created.user as { role?: string }).role !== 'attendee') {
          await ctx.context.internalAdapter.deleteSession(created.session.token);
          throw new APIError('FORBIDDEN', { message: 'Link-Anmeldung nur für Teilnehmende' });
        }
      }),
    },
    plugins: [
      twoFactor({ issuer: 'EventFlow' }),
      magicLink({
        // Konten legt nur das Portal an (zur E-Mail muss eine Anmeldung existieren)
        disableSignUp: true,
        expiresIn: PORTAL_LINK_TTL_SECONDS,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          if (options.sendPortalLink) await options.sendPortalLink({ email, url });
        },
      }),
      // muss das letzte Plugin sein
      ...(options.withNextCookies ? [nextCookies()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
