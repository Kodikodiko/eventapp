/**
 * Erleichterungen für die lokale Entwicklung. Standard: Admins brauchen immer die Zwei-Faktor-Anmeldung.
 *
 * - DEV_LOGIN=benutzer:passwort – Anmeldung mit diesem Benutzernamen und Passwort (ohne E-Mail, ohne 2FA).
 * - DEV_ADMIN_WITHOUT_2FA=true – Admins melden sich nur mit E-Mail und Passwort an.
 *
 * Beides greift nur, wenn die App unter localhost läuft (BETTER_AUTH_URL bzw. APP_URL). Auf einer echten Domain nie.
 */
type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalBaseUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function runsLocally(env: Env): boolean {
  return isLocalBaseUrl(env.BETTER_AUTH_URL || env.APP_URL || 'http://localhost:3000');
}

export type DevLogin = { username: string; password: string };

/** Zugangsdaten aus DEV_LOGIN (Format benutzer:passwort), nur lokal; sonst null. */
export function devLoginConfig(env: Env = process.env): DevLogin | null {
  const raw = env.DEV_LOGIN?.trim();
  if (!raw || !runsLocally(env)) return null;
  const sep = raw.indexOf(':');
  const username = raw.slice(0, sep).trim().toLowerCase();
  const password = raw.slice(sep + 1);
  if (sep < 1 || !password || !/^[a-z0-9._-]+$/.test(username)) return null;
  return { username, password };
}

/** E-Mail des Kontos hinter dem Entwickler-Login (Better Auth braucht eine E-Mail-Adresse). */
export function devLoginEmail(username: string): string {
  return `${username}@eventflow.localhost`;
}

export function adminTwoFactorRequired(env: Env = process.env): boolean {
  if (!runsLocally(env)) return true;
  return env.DEV_ADMIN_WITHOUT_2FA?.trim() !== 'true' && devLoginConfig(env) === null;
}

/** Admin-Konto mit ausreichender Anmeldung (2FA eingerichtet oder lokal abgeschaltet). */
export function hasAdminSecondFactor(user: { twoFactorEnabled?: boolean | null }, env: Env = process.env): boolean {
  return Boolean(user.twoFactorEnabled) || !adminTwoFactorRequired(env);
}
