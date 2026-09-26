/**
 * Anmeldung für die Next.js-App (nur serverseitig).
 */
import 'server-only';
import { getDb } from '@/server/db';
import { createAuth, type Auth } from './config';

const globalForAuth = globalThis as unknown as { __eventflowAuth?: Auth };

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Umgebungsvariable ${name} fehlt. Siehe .env.example und DEPLOYMENT.md (A.3).`);
  }
  return value;
}

export function getAuth(): Auth {
  if (!globalForAuth.__eventflowAuth) {
    const secret = requiredEnv('BETTER_AUTH_SECRET');
    if (secret.length < 32) throw new Error('BETTER_AUTH_SECRET muss mindestens 32 Zeichen lang sein.');
    globalForAuth.__eventflowAuth = createAuth(getDb(), {
      secret,
      baseURL: process.env.BETTER_AUTH_URL || process.env.APP_URL || 'http://localhost:3000',
      withNextCookies: true,
    });
  }
  return globalForAuth.__eventflowAuth;
}

export type { AuthSession } from './config';
