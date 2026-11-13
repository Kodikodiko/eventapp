import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { RegistrationAdminInput } from '@/lib/validation/registrations';
import { certificateFormSchema, fillCertificateText, toCertificateInput } from '@/lib/validation/certificates';
import { certificateDir } from '@/server/certificates/storage';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog } from '@/server/db/schema';
import { copyEvent, createEvent } from '@/server/services/events';
import {
  certificateDate,
  certificateTime,
  certificatePreviewPdf,
  certificatesPdf,
  getCertificateSettings,
  saveCertificateSettings,
} from '@/server/services/certificates';
import { cancelRegistrationByAdmin, createRegistrationByAdmin } from '@/server/services/registrations';

const actor = { userId: 'admin-1' };
// 1×1-PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const event = createEvent(db, actor, {
    slug: 'summit',
    name: { de: 'PM Summit', en: 'PM Summit EN' },
    description: null,
    location: 'Wien',
    startsAt: '2027-05-12T07:00:00.000Z',
    endsAt: '2027-05-13T16:00:00.000Z',
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: 10,
    priceNormalCents: 0,
    priceMemberCents: 0,
    ticketVatRateBp: 2000,
    allowStripe: false,
    allowInvoice: false,
    refundMode: 'automatic',
    cancellationRules: [],
  });
  const reg = (email: string, o: Partial<RegistrationAdminInput & { status: 'confirmed' | 'waitlisted' }> = {}) =>
    createRegistrationByAdmin(db, actor, event.id, {
      firstName: 'Anna',
      lastName: 'Huber',
      email,
      company: null,
      locale: 'de',
      roles: ['attendee'],
      ticketType: 'normal',
      priceCents: 0,
      billingCompany: null,
      billingAddress: null,
      status: 'confirmed',
      overbook: false,
      ...o,
    });
  return { db, event, reg };
}

const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

const input = toCertificateInput(
  certificateFormSchema.parse({
    heading: { de: ' Bestätigung ', en: '' },
    body: { de: '{name}\nwar bei {event} am {datum} in {ort}.', en: '{name}\nattended {event} on {date}.' },
    textColor: '#FFFFFF',
    removeImage: false,
  })
);

describe('Teilnahmebestätigung', () => {
  it('Platzhalter und Datum je Sprache', () => {
    expect(fillCertificateText('{name} / {Event} / {datum} / {uhrzeit} / {ort} / {x}', { name: 'A', event: 'E', datum: 'D', uhrzeit: 'U', ort: 'O' })).toBe('A / E / D / U / O / {x}');
    expect(certificateTime({ startsAt: '2027-05-12T06:00:00.000Z', endsAt: '2027-05-12T16:00:00.000Z' }, 'de')).toBe('08:00 bis 18:00 Uhr');
    expect(certificateTime({ startsAt: '2027-05-12T06:00:00.000Z', endsAt: '2027-05-12T16:00:00.000Z' }, 'en')).toBe('08:00–18:00');
    const event = { startsAt: '2027-05-12T07:00:00.000Z', endsAt: '2027-05-13T16:00:00.000Z' };
    expect(certificateDate(event, 'de')).toMatch(/^12\.\s?[–-]\s?13\. Mai 2027$/);
    expect(certificateDate({ ...event, endsAt: '2027-05-12T16:00:00.000Z' }, 'en')).toBe('12 May 2027');
    expect(input).toEqual({ heading: { de: 'Bestätigung' }, body: { de: '{name}\nwar bei {event} am {datum} in {ort}.', en: '{name}\nattended {event} on {date}.' }, textColor: '#ffffff' });
    expect(certificateFormSchema.safeParse({ ...input, heading: { de: 'x', en: '' }, body: { de: 'x', en: '' }, textColor: 'red', removeImage: false }).success).toBe(false);
  });

  it('Standardtexte, speichern mit Bild, Bild ersetzen und entfernen', async () => {
    const { db, event } = setup();
    expect(getCertificateSettings(db, event.id)).toMatchObject({ isDefault: true, imagePath: null });
    expect(pageCount(await certificatePreviewPdf(db, event.id, 'de'))).toBe(1);

    await saveCertificateSettings(db, actor, event.id, input, { upload: { fileName: 'hintergrund.png', data: PNG }, remove: false });
    const first = getCertificateSettings(db, event.id);
    expect(first).toMatchObject({ isDefault: false, imageName: 'hintergrund.png', textColor: '#ffffff', heading: { de: 'Bestätigung' } });
    expect(fs.existsSync(path.join(certificateDir(), first.imagePath!))).toBe(true);
    expect(pageCount(await certificatePreviewPdf(db, event.id, 'en'))).toBe(1);

    // Text ändern behält das Bild
    await saveCertificateSettings(db, actor, event.id, { ...input, textColor: '#000000' }, { upload: null, remove: false });
    expect(getCertificateSettings(db, event.id).imagePath).toBe(first.imagePath);

    await saveCertificateSettings(db, actor, event.id, input, { upload: { fileName: 'neu.png', data: PNG }, remove: false });
    const second = getCertificateSettings(db, event.id);
    expect(second.imagePath).not.toBe(first.imagePath);
    expect(fs.existsSync(path.join(certificateDir(), first.imagePath!))).toBe(false);

    await saveCertificateSettings(db, actor, event.id, input, { upload: null, remove: true });
    expect(getCertificateSettings(db, event.id).imagePath).toBeNull();
    expect(fs.existsSync(path.join(certificateDir(), second.imagePath!))).toBe(false);
  });

  it('lehnt falsche Bilder ab', async () => {
    const { db, event } = setup();
    const err = async (fileName: string, data: Buffer) => {
      try {
        await saveCertificateSettings(db, actor, event.id, input, { upload: { fileName, data }, remove: false });
        return 'OK';
      } catch (e) {
        return e instanceof ServiceError ? e.fieldErrors?.image : String(e);
      }
    };
    expect(await err('bild.gif', PNG)).toBe('imageType');
    expect(await err('bild.png', Buffer.from('%PDF-1.4'))).toBe('imageType');
    expect(await err('bild.png', Buffer.alloc(6 * 1024 * 1024))).toBe('imageTooLarge');
    expect(getCertificateSettings(db, event.id).isDefault).toBe(true);
  });

  it('PDF: eine Seite je angehakter Anmeldung (auch Warteliste/storniert), fremde Ids ignoriert; protokolliert', async () => {
    const { db, event, reg } = setup();
    const a = reg('a@example.org', { firstName: 'Eva', lastName: 'Zeller', locale: 'en' });
    const b = reg('b@example.org');
    const c = reg('c@example.org', { firstName: 'Max', lastName: 'Storno' });
    const w = reg('w@example.org', { status: 'waitlisted' });
    cancelRegistrationByAdmin(db, actor, c, 'Test');
    const result = await certificatesPdf(db, actor, event.id, [a, b, c, w, 99999]);
    expect(result?.count).toBe(4);
    expect(pageCount(result!.pdf)).toBe(4);
    expect((await certificatesPdf(db, actor, event.id, [w]))?.count).toBe(1);
    expect(await certificatesPdf(db, actor, event.id, [99999])).toBeNull();
    expect(await certificatesPdf(db, actor, event.id, [])).toBeNull();
    const audit = db.select().from(auditLog).where(eq(auditLog.action, 'certificate.generated')).all();
    expect(audit).toHaveLength(2);
    expect(audit[0].summary).toContain('4 Personen');
  });

  it('wird beim Kopieren eines Events mit eigenem Bild übernommen', async () => {
    const { db, event } = setup();
    await saveCertificateSettings(db, actor, event.id, input, { upload: { fileName: 'hintergrund.png', data: PNG }, remove: false });
    const copy = copyEvent(db, actor, event.id, { slug: 'summit-2', name: { de: 'Kopie' } });
    const copied = getCertificateSettings(db, copy.id);
    expect(copied).toMatchObject({ heading: { de: 'Bestätigung' }, imageName: 'hintergrund.png' });
    expect(copied.imagePath).not.toBe(getCertificateSettings(db, event.id).imagePath);
    expect(fs.existsSync(path.join(certificateDir(), copied.imagePath!))).toBe(true);
  });
});
