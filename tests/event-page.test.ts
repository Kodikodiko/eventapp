import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import { eventPageFormSchema, keptHighlightSlots, toEventPageFormValues, toEventPageInput } from '@/lib/validation/event-page';
import { mediaUrl } from '@/lib/validation/media';
import { openDatabase, type Db } from '@/server/db/core';
import { mediaDir, readMediaImage } from '@/server/media/storage';
import { copyEvent, createEvent } from '@/server/services/events';
import {
  addGalleryImages,
  deleteGalleryImage,
  getEventPageSettings,
  listGallery,
  moveGalleryImage,
  saveEventPage,
  setSpeakerPhoto,
  setSponsorLogo,
} from '@/server/services/event-page';
import { anonymizePersonTx } from '@/server/services/gdpr';
import { createSession, createSpeaker, listSessions, listSpeakers, removeSpeaker } from '@/server/services/program';
import { listPublicSessions, listPublicSpeakers, listPublicSponsors } from '@/server/services/public-events';
import { createSponsor, deleteSponsor } from '@/server/services/sponsors';

const actor = { userId: 'admin-1' };
// 1×1-PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const png = (name = 'bild.png') => ({ fileName: name, data: PNG });
const exists = (rel: string | null | undefined) => Boolean(rel) && fs.existsSync(path.join(mediaDir(), rel!));

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const event = createEvent(db, actor, {
    slug: 'forum',
    name: { de: 'Forum' },
    description: null,
    location: 'Wien',
    startsAt: '2027-05-12T07:00:00.000Z',
    endsAt: '2027-05-12T16:00:00.000Z',
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
  return { db, event };
}

function codeOf(fn: () => unknown): ServiceError {
  try {
    fn();
  } catch (e) {
    if (e instanceof ServiceError) return e;
    throw e;
  }
  throw new Error('kein Fehler');
}

const speakerInput = (email: string, first: string) => ({
  firstName: first,
  lastName: 'Muster',
  email,
  company: 'ACME',
  locale: 'de' as const,
  proposalStatus: 'confirmed' as const,
  slidesStatus: 'missing' as const,
});

describe('Eventseite', () => {
  it('Formular: leere Nutzen-Blöcke entfallen, Englisch optional', () => {
    const values = toEventPageFormValues({ tagline: null, highlights: [] });
    expect(values.highlights).toHaveLength(3);
    values.tagline = { de: ' Power Skills ', en: '' };
    values.highlights[1] = { title: { de: 'Praxis', en: 'Practice' }, text: { de: 'Fallstudien', en: '' }, iconPath: null };
    values.theme.primary = '#4f17a8';
    expect(keptHighlightSlots(eventPageFormSchema.parse(values))).toEqual([1]);
    expect(toEventPageInput(eventPageFormSchema.parse(values))).toEqual({
      tagline: { de: 'Power Skills' },
      theme: { primary: '#4F17A8' },
      highlights: [{ title: { de: 'Praxis', en: 'Practice' }, text: { de: 'Fallstudien' }, iconPath: null }],
    });
    values.theme.dark = 'lila';
    expect(eventPageFormSchema.safeParse(values).success).toBe(false);
  });

  it('speichert Motto, Nutzen und Titelbild; ersetzt und entfernt das Bild', () => {
    const { db, event } = setup();
    saveEventPage(db, actor, event.id, { tagline: { de: 'Motto' }, highlights: [] }, { hero: { upload: png('titel.png'), remove: false } });
    const first = getEventPageSettings(db, event.id);
    expect(first.tagline).toEqual({ de: 'Motto' });
    expect(first.heroImageName).toBe('titel.png');
    expect(exists(first.heroImagePath)).toBe(true);
    expect(readMediaImage(first.heroImagePath)?.type).toBe('image/png');
    expect(mediaUrl(first.heroImagePath)).toBe(`/api/media/${first.heroImagePath}`);

    saveEventPage(db, actor, event.id, { tagline: null, highlights: [] }, { hero: { upload: png('neu.png'), remove: false } });
    const second = getEventPageSettings(db, event.id);
    expect(second.heroImagePath).not.toBe(first.heroImagePath);
    expect(exists(first.heroImagePath)).toBe(false);

    saveEventPage(db, actor, event.id, { tagline: null, highlights: [] }, { hero: { upload: null, remove: true } });
    expect(getEventPageSettings(db, event.id).heroImagePath).toBeNull();
    expect(exists(second.heroImagePath)).toBe(false);
  });

  it('prüft Bildtyp und Inhalt', () => {
    const { db, event } = setup();
    expect(
      codeOf(() => saveEventPage(db, actor, event.id, { tagline: null, highlights: [] }, { hero: { upload: { fileName: 'a.gif', data: PNG }, remove: false } }))
        .fieldErrors
    ).toEqual({
      heroImage: 'mediaType',
    });
    expect(codeOf(() => addGalleryImages(db, actor, event.id, [{ fileName: 'a.jpg', data: PNG }])).fieldErrors).toEqual({ images: 'mediaType' });
    expect(readMediaImage('../../etc/passwd')).toBeNull();
  });

  it('Galerie: hochladen, Reihenfolge ändern, löschen; Event kopieren übernimmt Bilder als eigene Dateien', () => {
    const { db, event } = setup();
    addGalleryImages(db, actor, event.id, [png('a.png'), png('b.png'), png('c.png')]);
    const [a, b, c] = listGallery(db, event.id);
    moveGalleryImage(db, actor, c.id, -1);
    expect(listGallery(db, event.id).map((g) => g.imageName)).toEqual(['a.png', 'c.png', 'b.png']);
    moveGalleryImage(db, actor, a.id, -1); // schon vorne: keine Änderung
    deleteGalleryImage(db, actor, b.id);
    expect(listGallery(db, event.id).map((g) => g.imageName)).toEqual(['a.png', 'c.png']);
    expect(exists(b.imagePath)).toBe(false);

    saveEventPage(
      db,
      actor,
      event.id,
      { tagline: { de: 'Motto' }, highlights: [{ title: { de: 'T' }, text: { de: 'X' } }] },
      { hero: { upload: png(), remove: false } }
    );
    const copy = copyEvent(db, actor, event.id, { slug: 'forum-2028', name: { de: 'Forum 2028' } });
    const copied = getEventPageSettings(db, copy.id);
    expect(copied.tagline).toEqual({ de: 'Motto' });
    expect(copied.highlights).toHaveLength(1);
    expect(copied.heroImagePath).not.toBe(getEventPageSettings(db, event.id).heroImagePath);
    expect(exists(copied.heroImagePath)).toBe(true);
    expect(copied.gallery.map((g) => g.imageName)).toEqual(['a.png', 'c.png']);
    expect(copied.gallery[0].imagePath).not.toBe(a.imagePath);
  });

  it('Farben, Logo und Icons: speichern, behalten, ersetzen; fremde Pfade werden nicht übernommen; Kopie mit eigenen Dateien', () => {
    const { db, event } = setup();
    const h = (title: string, iconPath: string | null = null) => ({ title: { de: title }, text: { de: '' }, iconPath });
    saveEventPage(
      db,
      actor,
      event.id,
      { tagline: null, theme: { primary: '#4F17A8', surface: '#F6F4EF' }, highlights: [h('A'), h('B')] },
      {
        logo: { upload: png('logo.png'), remove: false },
        icons: [png('i1.png'), null],
      }
    );
    const first = getEventPageSettings(db, event.id);
    expect(first.theme).toEqual({ primary: '#4F17A8', surface: '#F6F4EF' });
    expect(first.logoName).toBe('logo.png');
    expect(exists(first.logoPath)).toBe(true);
    const icon = first.highlights[0].iconPath!;
    expect(exists(icon)).toBe(true);
    expect(first.highlights[1].iconPath).toBeUndefined();

    // Icon behalten (Pfad aus dem Formular), fremden Pfad verwerfen, Theme ohne Angabe unverändert
    saveEventPage(db, actor, event.id, { tagline: null, highlights: [h('A', icon), h('B', '999/00000000-0000-0000-0000-000000000000.png')] });
    const second = getEventPageSettings(db, event.id);
    expect(second.highlights.map((x) => x.iconPath)).toEqual([icon, undefined]);
    expect(second.theme).toEqual({ primary: '#4F17A8', surface: '#F6F4EF' });
    expect(second.logoPath).toBe(first.logoPath);

    const copy = copyEvent(db, actor, event.id, { slug: 'forum-icons', name: { de: 'Kopie' } });
    const copied = getEventPageSettings(db, copy.id);
    expect(copied.theme).toEqual(second.theme);
    expect(copied.logoPath).not.toBe(first.logoPath);
    expect(exists(copied.logoPath)).toBe(true);
    expect(copied.highlights[0].iconPath).not.toBe(icon);
    expect(exists(copied.highlights[0].iconPath)).toBe(true);

    // Icon entfernen, Logo entfernen, Farben zurücksetzen
    saveEventPage(db, actor, event.id, { tagline: null, theme: null, highlights: [h('A')] }, { logo: { upload: null, remove: true } });
    const third = getEventPageSettings(db, event.id);
    expect(third.theme).toBeNull();
    expect(third.logoPath).toBeNull();
    expect(exists(icon)).toBe(false);
    expect(exists(first.logoPath)).toBe(false);
  });

  it('Speaker: Rolle, Bio, Foto und Co-Speaker; öffentlich nur bestätigte', () => {
    const { db, event } = setup();
    const lead = createSpeaker(db, actor, event.id, { ...speakerInput('lead@x.example', 'Lea'), role: 'CEO', bio: { de: 'Bio', en: 'Bio EN' } });
    const co = createSpeaker(db, actor, event.id, speakerInput('co@x.example', 'Cora'));
    const pending = createSpeaker(db, actor, event.id, { ...speakerInput('p@x.example', 'Paul'), proposalStatus: 'pending' });
    setSpeakerPhoto(db, actor, lead, png('lea.png'));
    const s = createSession(db, actor, event.id, {
      title: { de: 'Fireside' },
      startsAt: '2027-05-12T08:00:00.000Z',
      endsAt: '2027-05-12T09:00:00.000Z',
      location: '',
      tag: 'talk',
      stream: 1,
      speakerId: lead,
      coSpeakerIds: [co, pending],
    });
    expect(listSessions(db, event.id)[0]).toMatchObject({ id: s, coSpeakerIds: [co, pending], coSpeakerNames: ['Cora Muster', 'Paul Muster'] });
    expect(listPublicSessions(db, event.id)[0]).toMatchObject({ speakerName: 'Lea Muster', coSpeakerNames: ['Cora Muster'] });
    expect(listSpeakers(db, event.id).find((x) => x.id === co)?.sessionCount).toBe(1);
    const pub = listPublicSpeakers(db, event.id);
    expect(pub.map((p) => p.name)).toEqual(['Cora Muster', 'Lea Muster']);
    const lea = pub.find((p) => p.id === lead)!;
    expect(lea).toMatchObject({ role: 'CEO', bio: { de: 'Bio', en: 'Bio EN' } });
    expect(exists(lea.photoPath)).toBe(true);

    // Co-Speaker eines anderen Events oder doppelt mit dem Haupt-Speaker: abgelehnt
    expect(
      codeOf(() =>
        createSession(db, actor, event.id, {
          title: { de: 'X' },
          startsAt: '2027-05-12T10:00:00.000Z',
          endsAt: '2027-05-12T11:00:00.000Z',
          location: '',
          tag: 'talk',
          stream: 1,
          speakerId: lead,
          coSpeakerIds: [lead],
        })
      ).fieldErrors
    ).toEqual({ coSpeakerIds: 'invalid' });

    removeSpeaker(db, actor, co);
    expect(listSessions(db, event.id)[0].coSpeakerIds).toEqual([pending]);
    const photo = lea.photoPath;
    removeSpeaker(db, actor, lead);
    expect(exists(photo)).toBe(false);
  });

  it('Löschen nach DSGVO entfernt Foto, Rolle und Bio des Speakers', () => {
    const { db, event } = setup();
    const id = createSpeaker(db, actor, event.id, { ...speakerInput('anon@x.example', 'Anna'), role: 'CTO', bio: { de: 'Bio' } });
    setSpeakerPhoto(db, actor, id, png());
    const before = listSpeakers(db, event.id)[0];
    db.transaction((tx) => anonymizePersonTx(tx, actor, before.personId, new Date(), 'request'));
    const after = listSpeakers(db, event.id)[0];
    expect(after).toMatchObject({ role: null, bio: null, photoPath: null });
    expect(exists(before.photoPath)).toBe(false);
  });

  it('Sponsor: Logo und Website öffentlich; Logo wird mit dem Sponsor gelöscht', () => {
    const { db, event } = setup();
    const id = createSponsor(db, actor, event.id, {
      companyName: 'ACME',
      packageId: null,
      customPriceCents: 0,
      customVatRateBp: 2000,
      discountCents: 0,
      dueOn: null,
      paymentStatus: 'open',
      billingAddress: '',
      vatId: null,
      notes: null,
      website: 'https://acme.example',
      contacts: [],
    });
    setSponsorLogo(db, actor, id, png('logo.png'));
    const [group] = listPublicSponsors(db, event.id);
    expect(group.companies[0]).toMatchObject({ name: 'ACME', website: 'https://acme.example' });
    const logo = group.companies[0].logoPath;
    expect(exists(logo)).toBe(true);
    deleteSponsor(db, actor, id);
    expect(exists(logo)).toBe(false);
  });
});
