import { describe, expect, it } from 'vitest';
import { toEml } from '@/server/mail';
import { confirmationMail, documentMail, reminderMail, waitlistOfferMail } from '@/server/mail/templates';

const decodeSubject = (eml: string) => {
  const raw = /^Subject: (.*(?:\r\n[ \t].*)*)/m.exec(eml)![1].replace(/\r\n[ \t]/g, ' ');
  return raw.replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=\s*/gi, (_, enc: string, text: string) =>
    enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64').toString('utf8') : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8')
  );
};

describe('E-Mail', () => {
  it('erzeugt eine .eml-Datei mit kodiertem Betreff, Antwortadresse und Anhang', async () => {
    const eml = await toEml(
      {
        to: 'eva@example.org',
        subject: 'Ein Platz ist frei: Frühjahr',
        text: 'Grüße\nZeile 2',
        replyTo: 'office@example.org',
        attachments: [{ filename: 'Rechnung-2027-0001.pdf', content: Buffer.from('%PDF-1.3 test'), contentType: 'application/pdf' }],
      },
      'EventFlow <noreply@localhost>',
      new Date('2027-01-01T00:00:00Z')
    );
    expect(eml).toMatch(/^To: eva@example\.org\r$/m);
    expect(eml).toMatch(/^Reply-To: office@example\.org\r$/m);
    expect(decodeSubject(eml)).toBe('Ein Platz ist frei: Frühjahr');
    expect(eml).toContain('multipart/mixed');
    expect(eml).toContain('filename=Rechnung-2027-0001.pdf');
    expect(eml).toContain(Buffer.from('%PDF-1.3 test').toString('base64'));
  });

  it('Wartelisten-Angebot in der Sprache der Person, mit Datenschutz-Link', () => {
    const base = { email: 'a@example.org', firstName: 'Ann', lastName: 'Lee', eventName: { de: 'Tagung', en: 'Conference' }, token: 'tok123', expiresAt: '2027-03-01T10:00:00.000Z', priceCents: 0 };
    const en = waitlistOfferMail({ ...base, locale: 'en' });
    expect(en.subject).toBe('A seat is available: Conference');
    expect(en.text).toContain('/en/offer/tok123');
    expect(en.text).toContain('Price: free');
    expect(en.text).toContain('Privacy notice: http://localhost:3000/en/privacy');
    const de = waitlistOfferMail({ ...base, locale: 'de', organizer: { name: 'Verein X', email: 'office@x.example' } });
    expect(de.text).toContain('gültig bis Montag, 1. März 2027 um 11:00');
    expect(de.text).toContain('Verein X\noffice@x.example\nDatenschutzerklärung: http://localhost:3000/de/privacy');
    expect(de.replyTo).toBe('office@x.example');
  });

  const attachment = { filename: 'Rechnung-2027-0001.pdf', content: Buffer.from('x') };
  const confirmation = {
    email: 'e@example.org',
    firstName: 'Eva',
    lastName: 'Muster',
    locale: 'de' as const,
    eventName: { de: 'Summit', en: 'Summit EN' },
    startsAt: '2027-05-12T06:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
    location: 'Graz',
    status: 'confirmed' as const,
    paymentMethod: 'invoice' as const,
    paid: false,
    priceCents: 20000,
    invoice: { number: '2027-0001', grossCents: 20000, dueAt: '2027-02-15', attachment },
    bank: { holder: 'Verein X', iban: 'AT611904300234573201', bic: 'BKAUATWW' },
    organizer: null,
  };

  it('Bestätigung bei Kauf auf Rechnung: Rechnung im Anhang, Zahlungsangaben', () => {
    const m = confirmationMail(confirmation);
    expect(m.subject).toBe('Anmeldung bestätigt: Summit');
    expect(m.text).toContain('Wann: Mittwoch, 12. Mai 2027, 08:00–18:00');
    expect(m.text).toContain('Wo: Graz');
    expect(m.text).toContain('Rechnung 2027-0001');
    expect(m.text).toContain('bis 15.02.2027');
    expect(m.text).toContain('IBAN: AT611904300234573201 · BIC: BKAUATWW');
    expect(m.attachments).toEqual([attachment]);
  });

  it('Bestätigung nach Online-Zahlung (en) und Warteliste ohne Anhang', () => {
    const paid = confirmationMail({ ...confirmation, locale: 'en', paymentMethod: 'stripe', paid: true, invoice: { ...confirmation.invoice, dueAt: null } });
    expect(paid.subject).toBe('Registration confirmed: Summit EN');
    expect(paid.text).toContain('We have received your payment');
    expect(paid.text).not.toContain('IBAN');
    const wait = confirmationMail({ ...confirmation, status: 'waitlisted', invoice: null });
    expect(wait.subject).toBe('Sie stehen auf der Warteliste: Summit');
    expect(wait.text).toContain('48 Stunden');
    expect(wait.attachments).toBeUndefined();
  });

  it('Rechnung, Gutschrift und Zahlungserinnerung', () => {
    const doc = { ...confirmation, type: 'invoice' as const, number: '2027-0001', relatedNumber: null, grossCents: 20000, dueAt: '2027-02-15', attachment };
    expect(documentMail(doc).subject).toBe('Rechnung 2027-0001 – Summit');
    const credit = documentMail({ ...doc, type: 'credit_note', number: '2027-0002', relatedNumber: '2027-0001', locale: 'en' });
    expect(credit.subject).toBe('Credit note 2027-0002 – Summit EN');
    expect(credit.text).toContain('for invoice 2027-0001');
    const r1 = reminderMail({ ...doc, level: 1, issuedAt: '2027-02-01T10:00:00.000Z', dueAt: '2027-02-15', openCents: 5000 });
    expect(r1.subject).toBe('Zahlungserinnerung: Rechnung 2027-0001 – Summit');
    expect(r1.text).toContain('Offen sind €\u00a050,00');
    expect(reminderMail({ ...doc, locale: 'en', level: 2, issuedAt: '2027-02-01T10:00:00.000Z', dueAt: '2027-02-15', openCents: 5000 }).subject).toBe('2nd payment reminder: invoice 2027-0001 – Summit EN');
  });
});
