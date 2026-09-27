/**
 * Anmeldung für die Next.js-App (nur serverseitig).
 */
import 'server-only';
import { getDb } from '@/server/db';
import { people } from '@/server/db/schema';
import { getMailer, trySend } from '@/server/mail';
import { portalLinkMail } from '@/server/mail/templates';
import { mailOrganizer } from '@/server/services/notifications';
import { portalLinkRecipient } from '@/server/services/portal';
import { eq } from 'drizzle-orm';
import { createAuth, PORTAL_LINK_TTL_SECONDS, type Auth } from './config';

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
      sendPortalLink: async ({ email, url }) => {
        const db = getDb();
        // nur Teilnehmer-Konten mit gültiger Person; Admins nie (Link würde die Zwei-Faktor-Anmeldung umgehen)
        const account = portalLinkRecipient(db, email);
        if (!account) return;
        const person = db.select().from(people).where(eq(people.id, account.personId)).get()!;
        await trySend(
          portalLinkMail({
            email: account.email,
            firstName: person.firstName,
            lastName: person.lastName,
            locale: account.locale,
            url,
            validMinutes: PORTAL_LINK_TTL_SECONDS / 60,
            organizer: mailOrganizer(db),
          }),
          getMailer()
        );
      },
    });
  }
  return globalForAuth.__eventflowAuth;
}

export type { AuthSession } from './config';
