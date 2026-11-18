/**
 * Speaker und Programmpunkte eines Events.
 * - Speaker verweisen auf eine Person (E-Mail); pro Event höchstens einmal.
 * - Programmpunkte liegen im Zeitraum des Events, pro Stream ohne Überschneidung. Ein Programmpunkt kann über
 *   mehrere nebeneinanderliegende Streams gehen (stream … streamTo, z. B. Keynote über alle).
 * - Streams: je Event 1–10 mit Namen; Position = Spalte im Programm. Löschen nur ohne Programmpunkte darin.
 */
import { and, asc, eq, gt, gte, lt, lte, ne, sql } from 'drizzle-orm';
import { ServiceError } from '@/lib/action-result';
import type { LocalizedText } from '@/lib/localized';
import { defaultStreamName, MAX_STREAMS, streamEnd, type StreamInfo } from '@/lib/streams';
import type { SessionInput, SpeakerInput } from '@/lib/validation/program';
import type { Db } from '@/server/db/core';
import { events, eventStreams, people, sessions, sessionSpeakers, speakers } from '@/server/db/schema';
import { removeMediaImage } from '@/server/media/storage';
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
  slidesUrl: string | null;
  role: string | null;
  bio: LocalizedText | null;
  photoPath: string | null;
  sessionCount: number;
};

export type SessionRow = typeof sessions.$inferSelect & { speakerName: string | null; coSpeakerIds: number[]; coSpeakerNames: string[] };

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
  for (const s of db
    .select({ speakerId: sessionSpeakers.speakerId })
    .from(sessionSpeakers)
    .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
    .where(eq(sessions.eventId, eventId))
    .all()) {
    counts.set(s.speakerId, (counts.get(s.speakerId) ?? 0) + 1);
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
      slidesUrl: s.slidesUrl,
      role: s.role,
      bio: s.bio,
      photoPath: s.photoPath,
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
      .values({
        eventId,
        personId,
        proposalStatus: input.proposalStatus,
        slidesStatus: input.slidesStatus,
        slidesUrl: input.slidesUrl ?? null,
        role: input.role ?? null,
        bio: input.bio ?? null,
      })
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
    tx.update(speakers)
      .set({
        proposalStatus: input.proposalStatus,
        slidesStatus: input.slidesStatus,
        slidesUrl: input.slidesUrl ?? null,
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
      })
      .where(eq(speakers.id, id))
      .run();
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
  const photo = db.transaction((tx) => {
    const sp = tx.select().from(speakers).where(eq(speakers.id, id)).get();
    if (!sp) throw new ServiceError('NOT_FOUND');
    loadWritableEvent(tx, sp.eventId);
    tx.update(sessions).set({ speakerId: null }).where(eq(sessions.speakerId, id)).run();
    tx.delete(speakers).where(eq(speakers.id, id)).run();
    writeAudit(tx, actor, { action: 'speaker.removed', entity: 'speaker', entityId: id, eventId: sp.eventId, summary: 'Speaker aus dem Event entfernt' });
    return sp.photoPath;
  });
  removeMediaImage(photo);
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
  const co = coSpeakersOf(db, eventId);
  return rows.map(({ s, firstName, lastName }) => ({
    ...s,
    speakerName: firstName ? `${firstName} ${lastName}` : null,
    coSpeakerIds: co.get(s.id)?.map((c) => c.speakerId) ?? [],
    coSpeakerNames: co.get(s.id)?.map((c) => c.name) ?? [],
  }));
}

/** Co-Speaker aller Programmpunkte eines Events je Programmpunkt (in Reihenfolge), mit Name und Status. */
export function coSpeakersOf(db: Db | Tx, eventId: number) {
  const rows = db
    .select({
      sessionId: sessionSpeakers.sessionId,
      speakerId: sessionSpeakers.speakerId,
      firstName: people.firstName,
      lastName: people.lastName,
      proposalStatus: speakers.proposalStatus,
      anonymizedAt: people.anonymizedAt,
    })
    .from(sessionSpeakers)
    .innerJoin(sessions, eq(sessions.id, sessionSpeakers.sessionId))
    .innerJoin(speakers, eq(speakers.id, sessionSpeakers.speakerId))
    .innerJoin(people, eq(people.id, speakers.personId))
    .where(eq(sessions.eventId, eventId))
    .orderBy(asc(sessionSpeakers.position))
    .all();
  const map = new Map<number, { speakerId: number; name: string; visible: boolean }[]>();
  for (const r of rows) {
    const list = map.get(r.sessionId) ?? [];
    list.push({ speakerId: r.speakerId, name: `${r.firstName} ${r.lastName}`.trim(), visible: r.proposalStatus === 'confirmed' && !r.anonymizedAt });
    map.set(r.sessionId, list);
  }
  return map;
}

function replaceCoSpeakers(tx: Tx, sessionId: number, ids: number[] | undefined) {
  if (ids === undefined) return;
  tx.delete(sessionSpeakers).where(eq(sessionSpeakers.sessionId, sessionId)).run();
  if (ids.length) tx.insert(sessionSpeakers).values(ids.map((speakerId, position) => ({ sessionId, speakerId, position }))).run();
}

function validateSession(tx: Tx, event: typeof events.$inferSelect, input: SessionInput, exceptId?: number) {
  if (input.startsAt < event.startsAt || input.endsAt > event.endsAt) {
    throw new ServiceError('INVALID', { startsAt: 'sessionOutsideEvent' });
  }
  // Ein Stream jenseits der angelegten (nur über Import/Seeds möglich) zählt einfach als weiterer Stream mit Standardnamen.
  const to = streamEnd(input);
  if (to > MAX_STREAMS) throw new ServiceError('INVALID', { streamTo: 'invalid' });
  if (input.speakerId != null) {
    const sp = tx.select().from(speakers).where(eq(speakers.id, input.speakerId)).get();
    if (!sp || sp.eventId !== event.id) throw new ServiceError('INVALID', { speakerId: 'invalid' });
  }
  for (const id of input.coSpeakerIds ?? []) {
    const sp = tx.select().from(speakers).where(eq(speakers.id, id)).get();
    if (!sp || sp.eventId !== event.id || id === input.speakerId) throw new ServiceError('INVALID', { coSpeakerIds: 'invalid' });
  }
  const overlap = tx
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.eventId, event.id),
        lte(sessions.stream, to),
        gte(sql`coalesce(${sessions.streamTo}, ${sessions.stream})`, input.stream),
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
    const { coSpeakerIds, ...values } = input;
    const [row] = tx
      .insert(sessions)
      .values({ ...values, streamTo: streamEnd(input), eventId })
      .returning()
      .all();
    replaceCoSpeakers(tx, row.id, coSpeakerIds);
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
    const { coSpeakerIds, ...values } = input;
    tx.update(sessions)
      .set({ ...values, streamTo: streamEnd(input) })
      .where(eq(sessions.id, id))
      .run();
    replaceCoSpeakers(tx, id, coSpeakerIds);
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

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

/**
 * Streams eines Events in Spaltenreihenfolge. Fehlende Einträge (ältere Daten) werden als „Stream n“ ergänzt –
 * mindestens einer und mindestens so viele, wie Programmpunkte verwenden.
 */
export function listStreams(db: Db | Tx, eventId: number): StreamInfo[] {
  const rows = db.select().from(eventStreams).where(eq(eventStreams.eventId, eventId)).orderBy(asc(eventStreams.position)).all();
  const used =
    db
      .select({ m: sql<number>`max(coalesce(${sessions.streamTo}, ${sessions.stream}))` })
      .from(sessions)
      .where(eq(sessions.eventId, eventId))
      .get()?.m ?? 0;
  const count = Math.min(MAX_STREAMS, Math.max(1, used, rows.at(-1)?.position ?? 0));
  const byPos = new Map(rows.map((r) => [r.position, r.name]));
  return Array.from({ length: count }, (_, i) => ({ position: i + 1, name: byPos.get(i + 1) ?? defaultStreamName(i + 1) }));
}

/** Legt fehlende Stream-Einträge an, damit Positionen lückenlos gespeichert sind. */
function materializeStreams(tx: Tx, eventId: number): StreamInfo[] {
  const list = listStreams(tx, eventId);
  const existing = new Set(
    tx
      .select({ p: eventStreams.position })
      .from(eventStreams)
      .where(eq(eventStreams.eventId, eventId))
      .all()
      .map((r) => r.p)
  );
  for (const s of list) if (!existing.has(s.position)) tx.insert(eventStreams).values({ eventId, position: s.position, name: s.name }).run();
  return list;
}

/** Erster Stream eines neuen Events (beim Anlegen). */
export function createDefaultStream(tx: Tx, eventId: number): void {
  tx.insert(eventStreams).values({ eventId, position: 1, name: defaultStreamName(1) }).run();
}

/** Streams beim Kopieren eines Events übernehmen. */
export function copyStreams(tx: Tx, sourceId: number, targetId: number): void {
  for (const s of listStreams(tx, sourceId)) tx.insert(eventStreams).values({ eventId: targetId, position: s.position, name: s.name }).run();
}

export function addStream(db: Db, actor: Actor, eventId: number, name: LocalizedText): number {
  return db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const list = materializeStreams(tx, eventId);
    if (list.length >= MAX_STREAMS) throw new ServiceError('CONFLICT', { _form: 'tooManyStreams' });
    const position = list.length + 1;
    tx.insert(eventStreams).values({ eventId, position, name }).run();
    // Punkte über alle bisherigen Streams (z. B. Keynote, Pause) bleiben über die ganze Breite
    if (list.length > 1) {
      tx.update(sessions)
        .set({ streamTo: position })
        .where(and(eq(sessions.eventId, eventId), eq(sessions.stream, 1), eq(sessions.streamTo, list.length)))
        .run();
    }
    writeAudit(tx, actor, { action: 'stream.created', entity: 'event', entityId: eventId, eventId, summary: `Stream ${position} „${name.de}“ angelegt` });
    return position;
  });
}

export function renameStream(db: Db, actor: Actor, eventId: number, position: number, name: LocalizedText): void {
  db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const list = materializeStreams(tx, eventId);
    if (!list.some((s) => s.position === position)) throw new ServiceError('NOT_FOUND');
    tx.update(eventStreams)
      .set({ name })
      .where(and(eq(eventStreams.eventId, eventId), eq(eventStreams.position, position)))
      .run();
    writeAudit(tx, actor, { action: 'stream.renamed', entity: 'event', entityId: eventId, eventId, summary: `Stream ${position} heißt „${name.de}“` });
  });
}

/**
 * Stream um eine Spalte nach links (-1) oder rechts (+1) verschieben. Programmpunkte in einem der beiden Streams
 * wandern mit; nicht möglich, wenn ein Programmpunkt über mehrere Streams nur einen der beiden abdeckt.
 */
export function moveStream(db: Db, actor: Actor, eventId: number, position: number, direction: -1 | 1): void {
  db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const list = materializeStreams(tx, eventId);
    const a = position;
    const b = position + direction;
    if (!list.some((s) => s.position === a) || !list.some((s) => s.position === b)) throw new ServiceError('INVALID');
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const rows = tx.select().from(sessions).where(eq(sessions.eventId, eventId)).all();
    const changes: { id: number; stream: number }[] = [];
    for (const s of rows) {
      const from = s.stream;
      const to = streamEnd(s);
      if (from === to) {
        if (from === lo) changes.push({ id: s.id, stream: hi });
        else if (from === hi) changes.push({ id: s.id, stream: lo });
      } else if ((from <= lo && to >= lo) !== (from <= hi && to >= hi)) {
        throw new ServiceError('CONFLICT', { _form: 'streamSpanned' });
      }
    }
    for (const c of changes) tx.update(sessions).set({ stream: c.stream, streamTo: c.stream }).where(eq(sessions.id, c.id)).run();
    const nameLo = list[lo - 1].name;
    const nameHi = list[hi - 1].name;
    const at = (p: number) => and(eq(eventStreams.eventId, eventId), eq(eventStreams.position, p));
    tx.update(eventStreams).set({ name: nameHi }).where(at(lo)).run();
    tx.update(eventStreams).set({ name: nameLo }).where(at(hi)).run();
    writeAudit(tx, actor, { action: 'stream.moved', entity: 'event', entityId: eventId, eventId, summary: `Stream „${list[a - 1].name.de}“ verschoben` });
  });
}

/**
 * Stream löschen – nicht möglich, solange ein Programmpunkt nur in diesem Stream liegt. Punkte über mehrere Streams
 * (z. B. Keynote) werden um diesen Stream schmäler; dahinterliegende Streams rücken nach.
 */
export function deleteStream(db: Db, actor: Actor, eventId: number, position: number): void {
  db.transaction((tx) => {
    loadWritableEvent(tx, eventId);
    const list = materializeStreams(tx, eventId);
    if (!list.some((s) => s.position === position)) throw new ServiceError('NOT_FOUND');
    if (list.length <= 1) throw new ServiceError('CONFLICT', { _form: 'lastStream' });
    const rows = tx.select().from(sessions).where(eq(sessions.eventId, eventId)).all();
    if (rows.some((s) => s.stream === position && streamEnd(s) === position)) throw new ServiceError('CONFLICT', { _form: 'streamInUse' });
    tx.delete(eventStreams)
      .where(and(eq(eventStreams.eventId, eventId), eq(eventStreams.position, position)))
      .run();
    for (const s of list.filter((x) => x.position > position)) {
      tx.update(eventStreams)
        .set({ position: s.position - 1 })
        .where(and(eq(eventStreams.eventId, eventId), eq(eventStreams.position, s.position)))
        .run();
    }
    for (const s of rows) {
      const from = s.stream > position ? s.stream - 1 : s.stream;
      const to = streamEnd(s) >= position ? streamEnd(s) - 1 : streamEnd(s);
      if (from !== s.stream || to !== s.streamTo) tx.update(sessions).set({ stream: from, streamTo: to }).where(eq(sessions.id, s.id)).run();
    }
    writeAudit(tx, actor, { action: 'stream.deleted', entity: 'event', entityId: eventId, eventId, summary: `Stream „${list[position - 1].name.de}“ gelöscht` });
  });
}
