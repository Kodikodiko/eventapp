/**
 * Speaker und Programmpunkte eines Events.
 * - Speaker verweisen auf eine Person (E-Mail); pro Event höchstens einmal.
 * - Programmpunkte liegen im Zeitraum des Events, pro Stream ohne Überschneidung.
 */
import { and, asc, eq, gt, lt, ne } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { SessionInput, SpeakerInput } from '@/lib/validation/program';
import type { Db } from '@/server/db/core';
import { events, people, sessions, speakers } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';
import { updatePerson, upsertPerson } from './people';

export type SpeakerRow = {
  id: number;
  personId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  locale: 'de' | 'en';
  proposalStatus: SpeakerInput['proposalStatus'];
  slidesStatus: SpeakerInput['slidesStatus'];
  sessionCount: number;
};

export type SessionRow = typeof sessions.$inferSelect & { speakerName: string | null };

function loadWritableEvent(tx: Tx | Db, eventId: number) {
  const event = tx.select().from(events).where(eq(events.id, eventId)).get();
  if (!event) throw new ServiceError('NOT_FOUND');
  if (event.archivedAt) throw new ServiceError('ARCHIVED');
  return event;
}

// ---------------------------------------------------------------------------
// Speaker
// ---------------------------------------------------------------------------

export function listSpeakers(db: Db, eventId: number): SpeakerRow[] {
  const rows = db
    .select({ s: speakers, p: people })
    .from(speakers)
    .innerJoin(people, eq(people.id, speakers.personId))
    .where(eq(speakers.eventId, eventId))
    .all();
  const counts = new Map<number, number>();
  for (const s of db.select({ speakerId: sessions.speakerId }).from(sessions).where(eq(sessions.eventId, eventId)).all()) {
    if (s.speakerId) counts.set(s.speakerId, (counts.get(s.speakerId) ?? 0) + 1);
  }
  return rows
    .map(({ s, p }) => ({
      id: s.id,
      personId: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      company: p.company,
      locale: p.locale,
      proposalStatus: s.proposalStatus,
      slidesStatus: s.slidesStatus,
      sessionCount: counts.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'));
}

export function createSpeaker(db: Db, actor: Actor, eventId: number, input: SpeakerInput): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const personId = upsertPerson(tx, input);
    const existing = tx
      .select({ id: speakers.id })
      .from(speakers)
      .where(and(eq(speakers.eventId, eventId), eq(speakers.personId, personId)))
      .get();
    if (existing) throw new ServiceError('CONFLICT', { email: 'alreadySpeaker' });
    const [row] = tx
      .insert(speakers)
      .values({ eventId, personId, proposalStatus: input.proposalStatus, slidesStatus: input.slidesStatus })
      .returning()
      .all();
    writeAudit(tx, actor, { action: 'speaker.created', entity: 'speaker', entityId: row.id, eventId, summary: 'Speaker hinzugefügt' });
    return row.id;
  });
}

export function updateSpeaker(db: Db, actor: Actor, id: number, input: SpeakerInput): void {
  db.transaction((tx) => {
    const sp = tx.select().from(speakers).where(eq(speakers.id, id)).get();
    if (!sp) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, sp.eventId);
    updatePerson(tx, sp.personId, input);
    tx.update(speakers).set({ proposalStatus: input.proposalStatus, slidesStatus: input.slidesStatus }).where(eq(speakers.id, id)).run();
    writeAudit(tx, actor, {
      action: 'speaker.updated',
      entity: 'speaker',
      entityId: id,
      eventId: sp.eventId,
      summary: `Einreichung ${input.proposalStatus}, Folien ${input.slidesStatus}`,
    });
  });
}

/** Entfernt den Speaker aus dem Event (die Person bleibt erhalten); Programmpunkte verlieren die Zuordnung. */
export function removeSpeaker(db: Db, actor: Actor, id: number): void {
  db.transaction((tx) => {
    const sp = tx.select().from(speakers).where(eq(speakers.id, id)).get();
    if (!sp) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, sp.eventId);
    tx.update(sessions).set({ speakerId: null }).where(eq(sessions.speakerId, id)).run();
    tx.delete(speakers).where(eq(speakers.id, id)).run();
    writeAudit(tx, actor, { action: 'speaker.removed', entity: 'speaker', entityId: id, eventId: sp.eventId, summary: 'Speaker aus dem Event entfernt' });
  });
}

// ---------------------------------------------------------------------------
// Programmpunkte
// ---------------------------------------------------------------------------

export function listSessions(db: Db, eventId: number): SessionRow[] {
  const rows = db
    .select({ s: sessions, firstName: people.firstName, lastName: people.lastName })
    .from(sessions)
    .leftJoin(speakers, eq(speakers.id, sessions.speakerId))
    .leftJoin(people, eq(people.id, speakers.personId))
    .where(eq(sessions.eventId, eventId))
    .orderBy(asc(sessions.startsAt), asc(sessions.stream))
    .all();
  return rows.map(({ s, firstName, lastName }) => ({ ...s, speakerName: firstName ? `${firstName} ${lastName}` : null }));
}

function validateSession(tx: Tx, event: typeof events.$inferSelect, input: SessionInput, exceptId?: number) {
  if (input.startsAt < event.startsAt || input.endsAt > event.endsAt) {
    throw new ServiceError('INVALID', { startsAt: 'sessionOutsideEvent' });
  }
  if (input.speakerId != null) {
    const sp = tx.select().from(speakers).where(eq(speakers.id, input.speakerId)).get();
    if (!sp || sp.eventId !== event.id) throw new ServiceError('INVALID', { speakerId: 'invalid' });
  }
  const overlap = tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.eventId, event.id),
        eq(sessions.stream, input.stream),
        lt(sessions.startsAt, input.endsAt),
        gt(sessions.endsAt, input.startsAt),
        exceptId ? ne(sessions.id, exceptId) : undefined
      )
    )
    .get();
  if (overlap) throw new ServiceError('CONFLICT', { stream: 'streamOverlap' });
}

export function createSession(db: Db, actor: Actor, eventId: number, input: SessionInput): number {
  return db.transaction((tx) => {
    const event = loadWritableEvent(tx, eventId);
    validateSession(tx, event, input);
    const [row] = tx.insert(sessions).values({ ...input, eventId }).returning().all();
    writeAudit(tx, actor, { action: 'session.created', entity: 'session', entityId: row.id, eventId, summary: `Programmpunkt Stream ${input.stream}` });
    return row.id;
  });
}

export function updateSession(db: Db, actor: Actor, id: number, input: SessionInput): void {
  db.transaction((tx) => {
    const current = tx.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!current) throw new ServiceError('NOT_FOUND');
    const event = loadWritableEvent(tx, current.eventId);
    validateSession(tx, event, input, id);
    tx.update(sessions).set(input).where(eq(sessions.id, id)).run();
    writeAudit(tx, actor, { action: 'session.updated', entity: 'session', entityId: id, eventId: current.eventId, summary: 'Programmpunkt geändert' });
  });
}

export function deleteSession(db: Db, actor: Actor, id: number): void {
  db.transaction((tx) => {
    const current = tx.select().from(sessions).where(eq(sessions.id, id)).get();
    if (!current) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, current.eventId);
    tx.delete(sessions).where(eq(sessions.id, id)).run();
    writeAudit(tx, actor, { action: 'session.deleted', entity: 'session', entityId: id, eventId: current.eventId, summary: 'Programmpunkt gelöscht' });
  });
}
