import { describe, expect, it } from 'vitest';
import { adminTwoFactorRequired, hasAdminSecondFactor } from '@/server/auth/two-factor-policy';

describe('Zwei-Faktor-Pflicht für Admins', () => {
  it('gilt standardmäßig', () => {
    expect(adminTwoFactorRequired({})).toBe(true);
    expect(hasAdminSecondFactor({ twoFactorEnabled: false }, {})).toBe(false);
    expect(hasAdminSecondFactor({ twoFactorEnabled: true }, {})).toBe(true);
  });

  it('lässt sich lokal abschalten', () => {
    for (const url of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(adminTwoFactorRequired({ DEV_ADMIN_WITHOUT_2FA: 'true', BETTER_AUTH_URL: url })).toBe(false);
    }
    expect(adminTwoFactorRequired({ DEV_ADMIN_WITHOUT_2FA: 'true' })).toBe(false);
    expect(hasAdminSecondFactor({ twoFactorEnabled: false }, { DEV_ADMIN_WITHOUT_2FA: 'true', APP_URL: 'http://localhost:3000' })).toBe(true);
  });

  it('bleibt auf einer echten Domain Pflicht', () => {
    expect(adminTwoFactorRequired({ DEV_ADMIN_WITHOUT_2FA: 'true', BETTER_AUTH_URL: 'https://events.example.org' })).toBe(true);
    expect(adminTwoFactorRequired({ DEV_ADMIN_WITHOUT_2FA: 'true', APP_URL: 'https://localhost.example.org' })).toBe(true);
    expect(adminTwoFactorRequired({ DEV_ADMIN_WITHOUT_2FA: '1', BETTER_AUTH_URL: 'http://localhost:3000' })).toBe(true);
  });
});
