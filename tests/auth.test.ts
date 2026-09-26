import { base32 } from '@better-auth/utils/base32';
import { createOTP } from '@better-auth/utils/otp';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { upsertAdmin, validateAdminInput } from '@/server/auth/admin-users';
import { createAuth } from '@/server/auth/config';
import { openDatabase } from '@/server/db/core';
import { auditLog, authUsers } from '@/server/db/schema';

const PASSWORD = 'ein-sehr-geheimes-passwort';

function setup() {
  const db = openDatabase({ path: ':memory:', log: () => {} });
  const auth = createAuth(db, { secret: 'test-secret-'.padEnd(48, 'x'), baseURL: 'http://localhost:3000' });
  return { db, auth };
}

/** Macht aus den Set-Cookie-Headern einer Antwort einen Cookie-Header für Folgeanfragen. */
function cookieHeader(response: Response): Headers {
  const cookies = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => !c.endsWith('='));
  return new Headers({ cookie: cookies.join('; ') });
}

async function signIn(auth: ReturnType<typeof setup>['auth'], email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password }, asResponse: true });
}

async function totpFromUri(totpURI: string): Promise<string> {
  const secret = new URL(totpURI).searchParams.get('secret')!;
  const raw = new TextDecoder().decode(base32.decode(secret));
  return createOTP(raw, { digits: 6, period: 30 }).totp();
}

describe('Admin-Konten', () => {
  it('prüfen die Eingaben', () => {
    expect(validateAdminInput({ email: 'x', name: 'A', password: 'kurz' })).toHaveLength(3);
    expect(validateAdminInput({ email: 'a@b.at', name: 'Anna', password: PASSWORD })).toEqual([]);
  });

  it('werden angelegt, E-Mail klein geschrieben, mit Audit-Eintrag', async () => {
    const { db } = setup();
    expect(await upsertAdmin(db, { email: 'Anna@Example.org', name: 'Anna', password: PASSWORD })).toBe('created');
    const user = db.select().from(authUsers).get()!;
    expect(user.email).toBe('anna@example.org');
    expect(user.role).toBe('admin');
    expect(db.select().from(auditLog).where(eq(auditLog.action, 'admin.created')).all()).toHaveLength(1);
  });

  it('werden nicht doppelt angelegt, Passwort nur mit resetPassword', async () => {
    const { db, auth } = setup();
    await upsertAdmin(db, { email: 'anna@example.org', name: 'Anna', password: PASSWORD });
    await expect(upsertAdmin(db, { email: 'anna@example.org', name: 'Anna', password: PASSWORD })).rejects.toThrow(/bereits/);
    const neu = 'ein-anderes-langes-passwort';
    expect(await upsertAdmin(db, { email: 'anna@example.org', name: 'Anna', password: neu }, { resetPassword: true })).toBe(
      'password_reset'
    );
    expect((await signIn(auth, 'anna@example.org', PASSWORD)).status).toBe(401);
    expect((await signIn(auth, 'anna@example.org', neu)).status).toBe(200);
  });
});

describe('Anmeldung', () => {
  it('liefert für einen Admin eine Sitzung mit Rolle', async () => {
    const { db, auth } = setup();
    await upsertAdmin(db, { email: 'anna@example.org', name: 'Anna', password: PASSWORD });
    const res = await signIn(auth, 'anna@example.org', PASSWORD);
    expect(res.status).toBe(200);
    const session = await auth.api.getSession({ headers: cookieHeader(res) });
    expect(session?.user.email).toBe('anna@example.org');
    expect(session?.user.role).toBe('admin');
    expect(session?.user.twoFactorEnabled).toBeFalsy();
  });

  it('lehnt falsche Passwörter ab', async () => {
    const { db, auth } = setup();
    await upsertAdmin(db, { email: 'anna@example.org', name: 'Anna', password: PASSWORD });
    expect((await signIn(auth, 'anna@example.org', 'falsches-passwort-123')).status).toBe(401);
    expect((await signIn(auth, 'niemand@example.org', PASSWORD)).status).toBe(401);
  });

  it('erlaubt keine Selbstregistrierung', async () => {
    const { auth } = setup();
    const res = await auth.api.signUpEmail({
      body: { email: 'neu@example.org', password: PASSWORD, name: 'Neu' },
      asResponse: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('verlangt nach Einrichtung der 2FA einen TOTP-Code', async () => {
    const { db, auth } = setup();
    await upsertAdmin(db, { email: 'anna@example.org', name: 'Anna', password: PASSWORD });
    const headers = cookieHeader(await signIn(auth, 'anna@example.org', PASSWORD));

    // Einrichtung: Passwort bestätigen → TOTP-URI + Backup-Codes → Code aus der App bestätigen
    const enabled = await auth.api.enableTwoFactor({ body: { password: PASSWORD, method: 'totp' }, headers });
    if (enabled.method !== 'totp') throw new Error('TOTP erwartet');
    expect(enabled.backupCodes.length).toBeGreaterThan(0);
    await auth.api.verifyTOTP({ body: { code: await totpFromUri(enabled.totpURI) }, headers });
    expect(db.select().from(authUsers).get()!.twoFactorEnabled).toBe(true);

    // Neue Anmeldung: nur mit Passwort gibt es keine Sitzung, sondern die Aufforderung zur 2FA
    const res = await signIn(auth, 'anna@example.org', PASSWORD);
    const body = (await res.json()) as { twoFactorRedirect?: boolean };
    expect(body.twoFactorRedirect).toBe(true);
    const sessionWithoutCode = await auth.api.getSession({ headers: cookieHeader(res) });
    expect(sessionWithoutCode).toBeNull();
  });
});
