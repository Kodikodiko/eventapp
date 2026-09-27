/** Simulierte Kasse für die Entwicklung (PAYMENT_PROVIDER=fake): leitet auf /pay/fake/<id> um. */
import { randomUUID } from 'node:crypto';
import { appBaseUrl } from './config';
import type { PaymentProvider } from './provider';

export const FAKE_SESSION_PREFIX = 'fake_cs_';

export const fakeProvider: PaymentProvider = {
  name: 'fake',
  async createCheckout(req) {
    const id = `${FAKE_SESSION_PREFIX}${randomUUID()}`;
    return { id, url: `${appBaseUrl()}/${req.locale}/pay/fake/${id}` };
  },
  async checkoutUrl(sessionId, locale) {
    return `${appBaseUrl()}/${locale}/pay/fake/${sessionId}`;
  },
};
