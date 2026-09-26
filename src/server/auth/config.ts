/**
 * Better-Auth-Konfiguration als Fabrik (ohne Next.js-Abhängigkeiten, damit Tests sie nutzen können).
 * Die App verwendet getAuth() aus ./index.ts.
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';
import type { Db } from '@/server/db/core';
import { authAccounts, authSessions, authTwoFactors, authUsers, authVerifications } from '@/server/db/schema';

export const MIN_PASSWORD_LENGTH = 12;

export type CreateAuthOptions = {
  secret: string;
  baseURL: string;
  /** nur innerhalb von Next.js aktivieren (setzt Cookies aus Server Actions) */
  withNextCookies?: boolean;
};

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
    plugins: [
      twoFactor({ issuer: 'EventFlow' }),
      // muss das letzte Plugin sein
      ...(options.withNextCookies ? [nextCookies()] : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
