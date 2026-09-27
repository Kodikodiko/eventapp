import { describe, expect, it } from 'vitest';
import { toEml } from '@/server/mail';
import { waitlistOfferMail } from '@/server/mail/templates';

describe('E-Mail', () => {
  it('erzeugt eine .eml-Datei mit kodiertem Betreff und Text', () => {
    const eml = toEml({ to: 'eva@example.org', subject: 'Ein Platz ist frei: Frühjahr', text: 'Grüße\nZeile 2' }, 'EventFlow <noreply@localhost>', new Date('2027-01-01T00:00:00Z'));
    expect(eml).toContain('To: eva@example.org\r\n');
    expect(eml).toContain(`Subject: =?UTF-8?B?${Buffer.from('Ein Platz ist frei: Frühjahr').toString('base64')}?=`);
    expect(eml).toContain('Content-Type: text/plain; charset=utf-8');
    const body = eml.split('\r\n\r\n')[1].replace(/\r\n/g, '');
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe('Grüße\r\nZeile 2');
  });

  it('Wartelisten-Angebot in der Sprache der Person', () => {
    const base = { email: 'a@example.org', firstName: 'Ann', lastName: 'Lee', eventName: { de: 'Tagung', en: 'Conference' }, token: 'tok123', expiresAt: '2027-03-01T10:00:00.000Z', priceCents: 0 };
    const en = waitlistOfferMail({ ...base, locale: 'en' });
    expect(en.subject).toBe('A seat is available: Conference');
    expect(en.text).toContain('/en/offer/tok123');
    expect(en.text).toContain('Price: free');
    const de = waitlistOfferMail({ ...base, locale: 'de' });
    expect(de.text).toContain('gültig bis Montag, 1. März 2027 um 11:00');
  });
});
