import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { SessionInput, SpeakerInput } from '@/lib/validation/program';
import { sessionFormSchema, toSessionInput } from '@/lib/validation/program';
import { openDatabase, type Db } from '@/server/db/core';
import { people } from '@/server/db/schema';
import { createEvent, setEventArchived, setSlidesPublic } from '@/server/services/events';
import { listPublicSessions } from '@/server/services/public-events';
import {
  addStream,
  createSession,
  deleteStream,
  listStreams,
  moveStream,
  renameStream,
  createSpeaker,
  deleteSession,
  listSessions,
  listSpeakers,
  removeSpeaker,
  updateSession,
  updateSpeaker,
} from '@/server/services/program';

const actor = { userId: 'admin-1' };

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const mk = (slug: string) =>
    createEvent(db, actor, {
      slug,
      name: { de: slug },
      description: null,
      location: '',
      startsAt: '2027-05-12T06:00:00.000Z',
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
  return { db, event: mk('summit'), other: mk('anderes') };
}

const speaker = (email: string, o: Partial<SpeakerInput> = {}): SpeakerInput => ({
  firstName: 'Eva',
  lastName: 'Reed',
  email,
  company: null,
  locale: 'en',
  proposalStatus: 'pending',
  slidesStatus: 'missing',
  ...o,
});

const session = (o: Partial<SessionInput> = {}): SessionInput => ({
  title: { de: 'Vortrag' },
  startsAt: '2027-05-12T07:00:00.000Z',
  endsAt: '2027-05-12T07:45:00.000Z',
  location: 'Saal A',
  tag: 'talk',
  stream: 1,
  streamTo: 1,
  speakerId: null,
  ...o,
});

function codeOf(fn: () => unknown) {
  try {
    fn();
    return { code: 'OK' };
  } catch (e) {
    if (e instanceof ServiceError) return { code: e.code, fields: e.fieldErrors };
    throw e;
  }
}

describe('Speaker', () => {
  it('werden angelegt, Person wiederverwendet, pro Event nur einmal', () => {
    const { db, event, other } = setup();
    createSpeaker(db, actor, event.id, speaker('eva@example.org'));
    expect(codeOf(() => createSpeaker(db, actor, event.id, speaker('EVA@example.org')))).toEqual({
      code: 'CONFLICT',
      fields: { email: 'alreadySpeaker' },
    });
    createSpeaker(db, actor, other.id, speaker('eva@example.org'));
    expect(db.select().from(people).all()).toHaveLength(1);
    expect(listSpeakers(db, event.id)[0]).toMatchObject({ email: 'eva@example.org', proposalStatus: 'pending', sessionCount: 0 });
  });

  it('Folien-Link: öffentlich nur bei bestätigten Speakern und veröffentlichten Folien', () => {
    const { db, event } = setup();
    const id = createSpeaker(db, actor, event.id, { ...speaker('eva@example.org'), slidesUrl: 'https://cloud.example/s/abc' });
    createSession(db, actor, event.id, session({ speakerId: id }));
    expect(listSpeakers(db, event.id)[0].slidesUrl).toBe('https://cloud.example/s/abc');
    expect(listPublicSessions(db, event.id)[0].slidesUrl).toBeNull();
    setSlidesPublic(db, actor, event.id, true);
    expect(listPublicSessions(db, event.id)[0].slidesUrl).toBeNull(); // Einreichung noch nicht bestätigt
    updateSpeaker(db, actor, id, { ...speaker('eva@example.org'), proposalStatus: 'confirmed', slidesUrl: 'https://cloud.example/s/abc' });
    expect(listPublicSessions(db, event.id)[0].slidesUrl).toBe('https://cloud.example/s/abc');
    setSlidesPublic(db, actor, event.id, false);
    expect(listPublicSessions(db, event.id)[0].slidesUrl).toBeNull();
  });

  it('werden bearbeitet und entfernt – Programmpunkte behalten, Zuordnung weg', () => {
    const { db, event } = setup();
    const id = createSpeaker(db, actor, event.id, speaker('eva@example.org'));
    updateSpeaker(db, actor, id, speaker('eva@example.org', { proposalStatus: 'confirmed', slidesStatus: 'uploaded', company: 'Reed AG' }));
    expect(listSpeakers(db, event.id)[0]).toMatchObject({ proposalStatus: 'confirmed', slidesStatus: 'uploaded', company: 'Reed AG' });
    createSession(db, actor, event.id, session({ speakerId: id }));
    expect(listSpeakers(db, event.id)[0].sessionCount).toBe(1);
    expect(listSessions(db, event.id)[0].speakerName).toBe('Eva Reed');
    removeSpeaker(db, actor, id);
    expect(listSpeakers(db, event.id)).toHaveLength(0);
    expect(listSessions(db, event.id)[0].speakerId).toBeNull();
  });
});

describe('Programmpunkte', () => {
  it('müssen im Zeitraum des Events liegen', () => {
    const { db, event } = setup();
    expect(codeOf(() => createSession(db, actor, event.id, session({ startsAt: '2027-05-12T05:00:00.000Z' }))).fields).toEqual({
      startsAt: 'sessionOutsideEvent',
    });
    expect(codeOf(() => createSession(db, actor, event.id, session({ endsAt: '2027-05-12T17:00:00.000Z' }))).code).toBe('INVALID');
  });

  it('überschneiden sich nicht im selben Stream', () => {
    const { db, event } = setup();
    const a = createSession(db, actor, event.id, session());
    expect(codeOf(() => createSession(db, actor, event.id, session({ startsAt: '2027-05-12T07:30:00.000Z', endsAt: '2027-05-12T08:00:00.000Z' })))).toEqual({
      code: 'CONFLICT',
      fields: { stream: 'streamOverlap' },
    });
    // anderer Stream zur selben Zeit ist erlaubt, direkt anschließend auch
    createSession(db, actor, event.id, session({ stream: 2 }));
    createSession(db, actor, event.id, session({ startsAt: '2027-05-12T07:45:00.000Z', endsAt: '2027-05-12T08:30:00.000Z' }));
    // beim Bearbeiten zählt der eigene Eintrag nicht
    updateSession(db, actor, a, session({ title: { de: 'Neu', en: 'New' } }));
    expect(listSessions(db, event.id).map((s) => s.title.de)).toEqual(['Neu', 'Vortrag', 'Vortrag']);
  });

  it('akzeptieren nur Speaker desselben Events', () => {
    const { db, event, other } = setup();
    const foreign = createSpeaker(db, actor, other.id, speaker('x@example.org'));
    expect(codeOf(() => createSession(db, actor, event.id, session({ speakerId: foreign }))).fields).toEqual({ speakerId: 'invalid' });
  });

  it('sind bei archivierten Events gesperrt; löschen funktioniert sonst', () => {
    const { db, event } = setup();
    const a = createSession(db, actor, event.id, session());
    deleteSession(db, actor, a);
    expect(listSessions(db, event.id)).toHaveLength(0);
    setEventArchived(db, actor, event.id, true);
    expect(codeOf(() => createSession(db, actor, event.id, session())).code).toBe('ARCHIVED');
  });

  it('Formular: Zeiten in Wiener Ortszeit, Ende nach Beginn', () => {
    const values = { title: { de: 'Keynote', en: '' }, startsAt: '2027-05-12T09:00', endsAt: '2027-05-12T09:45', location: ' Saal A ', tag: 'general' as const, stream: '2', streamTo: '4', speakerId: '', coSpeakerIds: [] as string[] };
    expect(toSessionInput(sessionFormSchema.parse(values))).toEqual({
      title: { de: 'Keynote' },
      startsAt: '2027-05-12T07:00:00.000Z',
      endsAt: '2027-05-12T07:45:00.000Z',
      location: 'Saal A',
      tag: 'general',
      stream: 2,
      streamTo: 4,
      speakerId: null,
      coSpeakerIds: [],
    });
    const bad = sessionFormSchema.safeParse({ ...values, endsAt: '2027-05-12T08:00' });
    expect(bad.success).toBe(false);
    const order = sessionFormSchema.safeParse({ ...values, streamTo: '1' });
    expect(order.success).toBe(false);
    expect(sessionFormSchema.safeParse({ ...values, streamTo: '11' }).success).toBe(false);
  });
});

describe('Streams', () => {
  const names = (db: Db, id: number) => listStreams(db, id).map((s) => s.name.de);
  const ranges = (db: Db, id: number) => listSessions(db, id).map((s) => `${s.title.de}:${s.stream}-${s.streamTo}`);

  it('neues Event hat einen Stream; anlegen bis höchstens 10, umbenennen', () => {
    const { db, event } = setup();
    expect(names(db, event.id)).toEqual(['Stream 1']);
    expect(addStream(db, actor, event.id, { de: 'Saal B' })).toBe(2);
    renameStream(db, actor, event.id, 1, { de: 'Saal A', en: 'Hall A' });
    expect(names(db, event.id)).toEqual(['Saal A', 'Saal B']);
    for (let i = 3; i <= 10; i++) addStream(db, actor, event.id, { de: `S${i}` });
    expect(codeOf(() => addStream(db, actor, event.id, { de: 'zu viel' }))).toEqual({ code: 'CONFLICT', fields: { _form: 'tooManyStreams' } });
  });

  it('Keynote über alle Streams blockiert jeden Stream in dieser Zeit', () => {
    const { db, event } = setup();
    addStream(db, actor, event.id, { de: 'B' });
    addStream(db, actor, event.id, { de: 'C' });
    createSession(db, actor, event.id, session({ title: { de: 'Keynote' }, stream: 1, streamTo: 3 }));
    expect(codeOf(() => createSession(db, actor, event.id, session({ stream: 3, streamTo: 3 })))).toEqual({
      code: 'CONFLICT',
      fields: { stream: 'streamOverlap' },
    });
    const later = { startsAt: '2027-05-12T08:00:00.000Z', endsAt: '2027-05-12T08:45:00.000Z' };
    createSession(db, actor, event.id, session({ ...later, title: { de: 'B' }, stream: 2, streamTo: 2 }));
    // Bereich 1–2 trifft den Punkt in Stream 2, Stream 3 allein ist frei
    expect(codeOf(() => createSession(db, actor, event.id, session({ ...later, stream: 1, streamTo: 2 }))).code).toBe('CONFLICT');
    createSession(db, actor, event.id, session({ ...later, title: { de: 'C' }, stream: 3, streamTo: 3 }));
    expect(ranges(db, event.id)).toEqual(['Keynote:1-3', 'B:2-2', 'C:3-3']);
    expect(listPublicSessions(db, event.id).map((s) => s.streamTo)).toEqual([3, 2, 3]);
    // ein weiterer Stream: „alle Streams“ bleibt alle
    addStream(db, actor, event.id, { de: 'D' });
    expect(ranges(db, event.id)).toEqual(['Keynote:1-4', 'B:2-2', 'C:3-3']);
  });

  it('verschieben tauscht Namen und Programmpunkte; nicht bei halb überdeckten Bereichen', () => {
    const { db, event } = setup();
    renameStream(db, actor, event.id, 1, { de: 'A' });
    addStream(db, actor, event.id, { de: 'B' });
    addStream(db, actor, event.id, { de: 'C' });
    createSession(db, actor, event.id, session({ title: { de: 'in A' }, stream: 1, streamTo: 1 }));
    moveStream(db, actor, event.id, 1, 1);
    expect(names(db, event.id)).toEqual(['B', 'A', 'C']);
    expect(ranges(db, event.id)).toEqual(['in A:2-2']);
    createSession(db, actor, event.id, session({ title: { de: 'Workshop' }, startsAt: '2027-05-12T09:00:00.000Z', endsAt: '2027-05-12T10:00:00.000Z', stream: 1, streamTo: 2 }));
    expect(codeOf(() => moveStream(db, actor, event.id, 2, 1))).toEqual({ code: 'CONFLICT', fields: { _form: 'streamSpanned' } });
    // Tausch innerhalb des Bereichs ist in Ordnung
    moveStream(db, actor, event.id, 2, -1);
    expect(names(db, event.id)).toEqual(['A', 'B', 'C']);
  });

  it('löschen: nicht mit eigenem Programmpunkt, Bereiche werden schmäler, rechts rückt nach', () => {
    const { db, event } = setup();
    addStream(db, actor, event.id, { de: 'B' });
    addStream(db, actor, event.id, { de: 'C' });
    createSession(db, actor, event.id, session({ title: { de: 'Keynote' }, stream: 1, streamTo: 3 }));
    createSession(db, actor, event.id, session({ title: { de: 'in C' }, startsAt: '2027-05-12T08:00:00.000Z', endsAt: '2027-05-12T08:30:00.000Z', stream: 3, streamTo: 3 }));
    expect(codeOf(() => deleteStream(db, actor, event.id, 3))).toEqual({ code: 'CONFLICT', fields: { _form: 'streamInUse' } });
    deleteStream(db, actor, event.id, 2);
    expect(names(db, event.id)).toEqual(['Stream 1', 'C']);
    expect(ranges(db, event.id)).toEqual(['Keynote:1-2', 'in C:2-2']);
    deleteStream(db, actor, event.id, 1);
    expect(ranges(db, event.id)).toEqual(['Keynote:1-1', 'in C:1-1']);
    expect(codeOf(() => deleteStream(db, actor, event.id, 1))).toEqual({ code: 'CONFLICT', fields: { _form: 'lastStream' } });
  });
});
