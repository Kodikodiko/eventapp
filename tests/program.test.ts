import { describe, expect, it } from 'vitest';
import { ServiceError } from '@/lib/action-result';
import type { SessionInput, SpeakerInput } from '@/lib/validation/program';
import { sessionFormSchema, toSessionInput } from '@/lib/validation/program';
import { openDatabase, type Db } from '@/server/db/core';
import { people } from '@/server/db/schema';
import { createEvent, setEventArchived } from '@/server/services/events';
import {
  createSession,
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
    const values = { title: { de: 'Keynote', en: '' }, startsAt: '2027-05-12T09:00', endsAt: '2027-05-12T09:45', location: ' Saal A ', tag: 'general' as const, stream: '2' as const, speakerId: '' };
    expect(toSessionInput(sessionFormSchema.parse(values))).toEqual({
      title: { de: 'Keynote' },
      startsAt: '2027-05-12T07:00:00.000Z',
      endsAt: '2027-05-12T07:45:00.000Z',
      location: 'Saal A',
      tag: 'general',
      stream: 2,
      speakerId: null,
    });
    const bad = sessionFormSchema.safeParse({ ...values, endsAt: '2027-05-12T08:00' });
    expect(bad.success).toBe(false);
  });
});
