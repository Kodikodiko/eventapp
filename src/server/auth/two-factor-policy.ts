/**
 * Ob Admins die Zwei-Faktor-Anmeldung brauchen. Standard: immer.
 * Nur für die lokale Entwicklung lässt sie sich mit DEV_ADMIN_WITHOUT_2FA=true abschalten – und auch das nur,
 * wenn die App unter localhost läuft (BETTER_AUTH_URL bzw. APP_URL). Auf einer echten Domain greift der Schalter nie.
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

export function adminTwoFactorRequired(env: Env = process.env): boolean {
  if (env.DEV_ADMIN_WITHOUT_2FA?.trim() !== 'true') return true;
  const baseUrl = env.BETTER_AUTH_URL || env.APP_URL || 'http://localhost:3000';
  return !isLocalBaseUrl(baseUrl);
}

/** Admin-Konto mit ausreichender Anmeldung (2FA eingerichtet oder lokal abgeschaltet). */
export function hasAdminSecondFactor(user: { twoFactorEnabled?: boolean | null }, env: Env = process.env): boolean {
  return Boolean(user.twoFactorEnabled) || !adminTwoFactorRequired(env);
}
