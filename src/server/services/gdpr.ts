/**
 * DSGVO-Werkzeuge (Spezifikation 7.4): Personen finden, vollständige Auskunft (JSON/XLSX), Verarbeitung einschränken,
 * Löschen durch Anonymisieren mit Aufbewahrung der Belege (§ 132 BAO) und Protokoll der Anfragen Betroffener.
 *
 * Löschen (D5): Stammdaten, Einwilligungen, Sponsor-Kontakte, Portal-Konto und Anmeldedetails werden gelöscht bzw.
 * geleert. Rechnungen und Gutschriften bleiben mit ihrem Empfänger-Snapshot unverändert bis zum Ende der
 * Aufbewahrungsfrist (`invoices.retain_until`) erhalten; Zahlungen und Beträge bleiben ohne Personenbezug.
 * Die Person ist danach zusätzlich eingeschränkt (keine E-Mails, kein Portal, nicht in Exporten).
 * Nach Ablauf der Frist leert der Löschlauf (retention.ts) auch den Empfänger der Belege.
 */
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { ServiceError } from '@/lib/action-result';
import { viennaDate } from '@/lib/dates';
import type { Db } from '@/server/db/core';
import {
  auditLog,
  authUsers,
  consents,
  dsrRequests,
  DSR_TYPES,
  events,
  expenses,
  invoices,
  legalDocuments,
  payments,
  people,
  refunds,
  registrationRoles,
  registrations,
  roles,
  sessions,
  speakers,
  sponsorContacts,
  sponsors,
  waitlistOffers,
} from '@/server/db/schema';
import { removeMediaImage } from '@/server/media/storage';
import { writeAudit, type Actor, type Tx } from './audit';

export type DsrType = (typeof DSR_TYPES)[number];

/** Anzeigename anonymisierter Personen (Vorname bleibt leer). */
export const ANONYMIZED_NAME = 'Anonymisiert';

/** Frist für die Erledigung einer Anfrage (Art. 12 Abs. 3 DSGVO): ein Monat. */
export function dsrDueDate(receivedAt: string): string {
  const [y, m, d] = receivedAt.slice(0, 10).split('-').map(Number);
  // gleicher Tag im Folgemonat; gibt es den nicht (31.1.), dann der letzte Tag des Folgemonats
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const due = new Date(Date.UTC(y, m, Math.min(d, lastDay)));
  return due.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

export type PersonHit = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  restrictedAt: string | null;
  anonymizedAt: string | null;
  registrations: number;
  speakers: number;
  sponsorContacts: number;
};

const PERSON_HIT_FIELDS = {
  id: people.id,
  firstName: people.firstName,
  lastName: people.lastName,
  email: people.email,
  company: people.company,
  restrictedAt: people.restrictedAt,
  anonymizedAt: people.anonymizedAt,
  // Unterabfragen mit Alias: Drizzle schreibt Spalten in sql`` ohne Tabellennamen
  registrations: sql<number>`(SELECT count(*) FROM registrations x WHERE x.person_id = "people"."id")`,
  speakers: sql<number>`(SELECT count(*) FROM speakers x WHERE x.person_id = "people"."id")`,
  sponsorContacts: sql<number>`(SELECT count(*) FROM sponsor_contacts x WHERE x.person_id = "people"."id")`,
};

/**
 * Personen suchen: über die E-Mail-Adresse (ohne Groß-/Kleinschreibung, Leerzeichen am Rand egal) oder über
 * Teile von Name, E-Mail und Firma. Ein exakter E-Mail-Treffer steht immer zuerst.
 */
export function searchPeople(db: Db, query: string, limit = 50): PersonHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const like = (expr: ReturnType<typeof sql>) => sql`lower(${expr}) LIKE ${pattern} ESCAPE '\\'`;
  return db
    .select(PERSON_HIT_FIELDS)
    .from(people)
    .where(
      or(
        eq(people.email, q),
        like(sql`${people.email}`),
        like(sql`${people.firstName} || ' ' || ${people.lastName}`),
        like(sql`${people.lastName} || ' ' || ${people.firstName}`),
        like(sql`coalesce(${people.company}, '')`)
      )
    )
    .orderBy(sql`${people.email} = ${q} DESC`, asc(people.lastName), asc(people.firstName))
    .limit(limit)
    .all();
}

export function getPersonHit(db: Db, personId: number): PersonHit | undefined {
  return db.select(PERSON_HIT_FIELDS).from(people).where(eq(people.id, personId)).get();
}

// ---------------------------------------------------------------------------
// Auskunft (Art. 15, 20)
// ---------------------------------------------------------------------------

type Row = Record<string, string | number | boolean | null>;

/** Abschnitte der Auskunft in fester Reihenfolge (Schlüssel = Blattname im XLSX). */
export const EXPORT_SECTIONS = [
  'person',
  'portalAccounts',
  'registrations',
  'consents',
  'speakers',
  'sponsorContacts',
  'payments',
  'refunds',
  'invoices',
  'speakerExpenses',
  'requests',
  'auditLog',
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export type PersonExport = {
  generatedAt: string;
  personId: number;
} & Record<ExportSection, Row[]>;

const euro = (cents: number | null | undefined) => (cents == null ? null : cents / 100);
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const eventName = (name: { de: string; en?: string } | null | undefined) => name?.de ?? null;

/** Alle gespeicherten Daten einer Person (Teilnehmende, Speaker, Sponsor-Kontakte, Einwilligungen, Belege, Protokoll). */
export function personDataExport(db: Db, personId: number, now = new Date()): PersonExport | null {
  const person = db.select().from(people).where(eq(people.id, personId)).get();
  if (!person) return null;

  const accounts = db.select().from(authUsers).where(eq(authUsers.personId, personId)).all();

  const regRows = db
    .select({ r: registrations, eventName: events.name, eventStartsAt: events.startsAt })
    .from(registrations)
    .innerJoin(events, eq(events.id, registrations.eventId))
    .where(eq(registrations.personId, personId))
    .orderBy(asc(registrations.createdAt))
    .all();
  const regIds = regRows.map((x) => x.r.id);
  const roleRows = regIds.length
    ? db
        .select({ registrationId: registrationRoles.registrationId, key: roles.key })
        .from(registrationRoles)
        .innerJoin(roles, eq(roles.id, registrationRoles.roleId))
        .where(inArray(registrationRoles.registrationId, regIds))
        .all()
    : [];
  const rolesOf = (id: number) =>
    roleRows
      .filter((x) => x.registrationId === id)
      .map((x) => x.key)
      .sort()
      .join(', ');

  const consentRows = db
    .select({ c: consents, version: legalDocuments.version, eventName: events.name })
    .from(consents)
    .leftJoin(legalDocuments, eq(legalDocuments.id, consents.documentId))
    .leftJoin(events, eq(events.id, consents.eventId))
    .where(eq(consents.personId, personId))
    .orderBy(asc(consents.grantedAt))
    .all();

  const speakerRows = db
    .select({ s: speakers, eventName: events.name })
    .from(speakers)
    .innerJoin(events, eq(events.id, speakers.eventId))
    .where(eq(speakers.personId, personId))
    .all();
  const speakerIds = speakerRows.map((x) => x.s.id);
  const sessionRows = speakerIds.length
    ? db.select({ speakerId: sessions.speakerId, title: sessions.title, startsAt: sessions.startsAt }).from(sessions).where(inArray(sessions.speakerId, speakerIds)).all()
    : [];

  const contactRows = db
    .select({ c: sponsorContacts, companyName: sponsors.companyName, eventName: events.name })
    .from(sponsorContacts)
    .innerJoin(sponsors, eq(sponsors.id, sponsorContacts.sponsorId))
    .innerJoin(events, eq(events.id, sponsors.eventId))
    .where(eq(sponsorContacts.personId, personId))
    .all();

  const paymentRows = regIds.length ? db.select().from(payments).where(inArray(payments.registrationId, regIds)).all() : [];
  const paymentIds = paymentRows.map((p) => p.id);
  const refundRows = paymentIds.length ? db.select().from(refunds).where(inArray(refunds.paymentId, paymentIds)).all() : [];
  const invoiceRows = regIds.length
    ? db.select().from(invoices).where(inArray(invoices.registrationId, regIds)).orderBy(asc(invoices.issuedAt)).all()
    : [];

  const expenseRows = speakerIds.length
    ? db
        .select({ x: expenses, eventName: events.name })
        .from(expenses)
        .innerJoin(events, eq(events.id, expenses.eventId))
        .where(inArray(expenses.speakerId, speakerIds))
        .all()
    : [];

  const requestRows = db.select().from(dsrRequests).where(eq(dsrRequests.personId, personId)).orderBy(asc(dsrRequests.receivedAt)).all();

  // Protokolleinträge, die sich auf die Person oder ihre Datensätze beziehen
  const refs: [string, (number | string)[]][] = [
    ['person', [personId]],
    ['registration', regIds],
    ['speaker', speakerIds],
    ['invoice', invoiceRows.map((i) => i.id)],
    ['refund', refundRows.map((r) => r.id)],
    ['auth_user', accounts.map((a) => a.id)],
  ];
  const auditConds = refs
    .filter(([, ids]) => ids.length > 0)
    .map(([entity, ids]) => and(eq(auditLog.entity, entity), inArray(auditLog.entityId, ids.map(String)))!);
  const auditRows = db.select().from(auditLog).where(or(...auditConds)).orderBy(asc(auditLog.at)).all();

  return {
    generatedAt: now.toISOString(),
    personId,
    person: [
      {
        id: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        company: person.company,
        phone: person.phone,
        locale: person.locale,
        createdAt: person.createdAt,
        updatedAt: person.updatedAt,
        restrictedAt: person.restrictedAt,
        anonymizedAt: person.anonymizedAt,
      },
    ],
    portalAccounts: accounts.map((a) => ({
      name: a.name,
      email: a.email,
      role: a.role,
      emailVerified: a.emailVerified,
      createdAt: iso(a.createdAt),
      updatedAt: iso(a.updatedAt),
    })),
    registrations: regRows.map(({ r, eventName: name, eventStartsAt }) => ({
      id: r.id,
      event: eventName(name),
      eventStartsAt,
      roles: rolesOf(r.id),
      status: r.status,
      paymentStatus: r.paymentStatus,
      paymentMethod: r.paymentMethod,
      ticketType: r.ticketType,
      priceEur: euro(r.priceCents),
      memberNumberEntered: r.memberNumberEntered,
      billingCompany: r.billingCompany,
      billingAddress: r.billingAddress,
      source: r.source,
      createdAt: r.createdAt,
      confirmedAt: r.confirmedAt,
      cancelledAt: r.cancelledAt,
      cancelReason: r.cancelReason,
      checkedInAt: r.checkedInAt,
    })),
    consents: consentRows.map(({ c, version, eventName: name }) => ({
      kind: c.kind,
      documentVersion: version ?? null,
      event: eventName(name),
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
      source: c.source,
    })),
    speakers: speakerRows.map(({ s, eventName: name }) => ({
      id: s.id,
      event: eventName(name),
      proposalStatus: s.proposalStatus,
      slidesStatus: s.slidesStatus,
      slidesUrl: s.slidesUrl,
      role: s.role,
      bio: s.bio ? [s.bio.de, s.bio.en].filter(Boolean).join(' / ') : null,
      photo: s.photoPath ? 'ja' : null,
      createdAt: s.createdAt,
      sessions: sessionRows
        .filter((x) => x.speakerId === s.id)
        .map((x) => `${x.startsAt} ${x.title.de}`)
        .join('; '),
    })),
    sponsorContacts: contactRows.map(({ c, companyName, eventName: name }) => ({
      sponsor: companyName,
      event: eventName(name),
      function: c.function,
    })),
    payments: paymentRows.map((p) => ({
      registrationId: p.registrationId,
      method: p.method,
      status: p.status,
      amountEur: euro(p.amountCents),
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    })),
    refunds: refundRows.map((r) => ({
      amountEur: euro(r.amountCents),
      status: r.status,
      reason: r.reason,
      proposedAt: r.proposedAt,
      executedAt: r.executedAt,
    })),
    invoices: invoiceRows.map((i) => ({
      number: i.number,
      type: i.type,
      issuedAt: i.issuedAt,
      serviceDate: i.serviceDate,
      dueAt: i.dueAt,
      recipientName: i.recipient.name,
      recipientCompany: i.recipient.company ?? null,
      recipientAddress: i.recipient.address,
      recipientEmail: i.recipient.email ?? null,
      grossEur: euro(i.grossCents),
      retainUntil: i.retainUntil,
    })),
    speakerExpenses: expenseRows.map(({ x, eventName: name }) => ({
      event: eventName(name),
      spentOn: x.spentOn,
      amountEur: euro(x.amountCents),
      description: x.description,
      supplier: x.supplier,
      status: x.status,
    })),
    requests: requestRows.map((r) => ({
      type: r.type,
      receivedAt: r.receivedAt,
      dueOn: dsrDueDate(r.receivedAt),
      completedAt: r.completedAt,
      notes: r.notes,
    })),
    auditLog: auditRows.map((a) => ({ at: a.at, action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary })),
  };
}

const SECTION_TITLES: Record<'de' | 'en', Record<ExportSection, string>> = {
  de: {
    person: 'Person',
    portalAccounts: 'Portal-Konto',
    registrations: 'Anmeldungen',
    consents: 'Einwilligungen',
    speakers: 'Speaker',
    sponsorContacts: 'Sponsor-Kontakte',
    payments: 'Zahlungen',
    refunds: 'Erstattungen',
    invoices: 'Rechnungen',
    speakerExpenses: 'Speaker-Kosten',
    requests: 'Anfragen',
    auditLog: 'Protokoll',
  },
  en: {
    person: 'Person',
    portalAccounts: 'Portal account',
    registrations: 'Registrations',
    consents: 'Consents',
    speakers: 'Speaker',
    sponsorContacts: 'Sponsor contacts',
    payments: 'Payments',
    refunds: 'Refunds',
    invoices: 'Invoices',
    speakerExpenses: 'Speaker expenses',
    requests: 'Requests',
    auditLog: 'Audit log',
  },
};

/** Auskunft als Excel-Datei: ein Blatt je Abschnitt, Spaltennamen wie im JSON, Datumsangaben als ISO-Text. */
export async function buildPersonWorkbook(data: PersonExport, locale: 'de' | 'en'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EventFlow';
  for (const section of EXPORT_SECTIONS) {
    const rows = data[section];
    const ws = wb.addWorksheet(SECTION_TITLES[locale][section]);
    const keys = rows.length ? Object.keys(rows[0]) : ['–'];
    ws.columns = keys.map((k) => ({ header: k, key: k, width: Math.min(40, Math.max(12, k.length + 2)) }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// Einschränken (Art. 18) und Löschen (Art. 17)
// ---------------------------------------------------------------------------

function requirePerson(tx: Tx | Db, personId: number) {
  const person = tx.select().from(people).where(eq(people.id, personId)).get();
  if (!person) throw new ServiceError('NOT_FOUND');
  return person;
}

/** Offene Anfragen eines Typs für die Person als erledigt markieren. */
function completeOpenRequests(tx: Tx, actor: Actor, personId: number, type: DsrType, nowIso: string): number {
  const open = tx
    .select({ id: dsrRequests.id })
    .from(dsrRequests)
    .where(and(eq(dsrRequests.personId, personId), eq(dsrRequests.type, type), isNull(dsrRequests.completedAt)))
    .all();
  for (const r of open) {
    tx.update(dsrRequests).set({ completedAt: nowIso, handledBy: actor.userId }).where(eq(dsrRequests.id, r.id)).run();
    writeAudit(tx, actor, { action: 'dsr_request.completed', entity: 'dsr_request', entityId: r.id, summary: `Typ ${type}, automatisch erledigt` });
  }
  return open.length;
}

/** Verarbeitung einschränken: keine E-Mails, kein Portal, nicht in Exporten. */
export function restrictPerson(db: Db, actor: Actor, personId: number, now = new Date()): void {
  db.transaction((tx) => {
    const person = requirePerson(tx, personId);
    if (person.restrictedAt) return;
    const nowIso = now.toISOString();
    tx.update(people).set({ restrictedAt: nowIso, updatedAt: nowIso }).where(eq(people.id, personId)).run();
    writeAudit(tx, actor, { action: 'person.restricted', entity: 'person', entityId: personId });
    completeOpenRequests(tx, actor, personId, 'restriction', nowIso);
  });
}

/** Einschränkung aufheben (nicht bei anonymisierten Personen). */
export function liftRestriction(db: Db, actor: Actor, personId: number, now = new Date()): void {
  db.transaction((tx) => {
    const person = requirePerson(tx, personId);
    if (person.anonymizedAt) throw new ServiceError('CONFLICT', { _form: 'gdprAnonymized' });
    if (!person.restrictedAt) return;
    tx.update(people).set({ restrictedAt: null, updatedAt: now.toISOString() }).where(eq(people.id, personId)).run();
    writeAudit(tx, actor, { action: 'person.restriction_lifted', entity: 'person', entityId: personId });
  });
}

export type ErasureCheck = {
  /** Anmeldungen zu Events, die noch nicht vorbei sind und nicht storniert sind */
  activeRegistrations: number;
  /** Erstattungen, die noch entschieden oder ausgeführt werden müssen */
  openRefunds: number;
  /** Belege, die wegen der Aufbewahrungspflicht erhalten bleiben */
  retainedInvoices: number;
};

/** Was einer Löschung entgegensteht bzw. erhalten bleibt. */
export function erasureCheck(db: Db | Tx, personId: number, now = new Date()): ErasureCheck {
  const nowIso = now.toISOString();
  const active =
    db
      .select({ n: sql<number>`count(*)` })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(registrations.personId, personId), sql`${registrations.status} <> 'cancelled'`, gte(events.endsAt, nowIso)))
      .get()?.n ?? 0;
  const openRefunds =
    db
      .select({ n: sql<number>`count(*)` })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .innerJoin(registrations, eq(registrations.id, payments.registrationId))
      .where(and(eq(registrations.personId, personId), inArray(refunds.status, ['proposed', 'approved', 'failed'])))
      .get()?.n ?? 0;
  const retained =
    db
      .select({ n: sql<number>`count(*)` })
      .from(invoices)
      .innerJoin(registrations, eq(registrations.id, invoices.registrationId))
      .where(and(eq(registrations.personId, personId), gte(invoices.retainUntil, viennaDate(nowIso))))
      .get()?.n ?? 0;
  return { activeRegistrations: active, openRefunds, retainedInvoices: retained };
}

export type AnonymizeResult = {
  registrations: number;
  consents: number;
  sponsorContacts: number;
  speakers: number;
  accounts: number;
  retainedInvoices: number;
};

/**
 * Person anonymisieren (innerhalb einer Transaktion). Belege bleiben unverändert (BAO), Anmeldungen bleiben ohne
 * Personenbezug für Zahlen und Zahlungen erhalten. Wird auch vom Löschlauf verwendet.
 */
export function anonymizePersonTx(tx: Tx, actor: Actor, personId: number, now: Date, reason: 'request' | 'retention'): AnonymizeResult {
  const nowIso = now.toISOString();
  const regIds = tx.select({ id: registrations.id }).from(registrations).where(eq(registrations.personId, personId)).all().map((r) => r.id);
  for (const id of regIds) {
    tx.update(registrations)
      .set({
        memberId: null,
        memberNumberEntered: null,
        billingCompany: null,
        billingAddress: null,
        cancelReason: null,
        // QR-Code ungültig machen
        qrToken: `anon-${randomBytes(12).toString('hex')}`,
      })
      .where(eq(registrations.id, id))
      .run();
  }
  if (regIds.length) tx.delete(waitlistOffers).where(inArray(waitlistOffers.registrationId, regIds)).run();
  const consentCount = tx.delete(consents).where(eq(consents.personId, personId)).run().changes;
  const contactCount = tx.delete(sponsorContacts).where(eq(sponsorContacts.personId, personId)).run().changes;
  // Speaker-Einträge bleiben ohne Namen (Programm und Kosten); Folien-Link, Rolle, Kurzbio und Foto werden entfernt
  const photos = tx.select({ photoPath: speakers.photoPath }).from(speakers).where(eq(speakers.personId, personId)).all();
  const speakerCount = tx.update(speakers).set({ slidesUrl: null, role: null, bio: null, photoPath: null }).where(eq(speakers.personId, personId)).run().changes;
  // Fotodateien sofort löschen (bei einem späteren Abbruch der Transaktion fehlt nur das Bild)
  for (const p of photos) removeMediaImage(p.photoPath);
  // Portal-Konten löschen; Admin-Konten bleiben, verlieren aber die Verknüpfung
  const accountCount =
    tx.delete(authUsers).where(and(eq(authUsers.personId, personId), eq(authUsers.role, 'attendee'))).run().changes +
    tx.update(authUsers).set({ personId: null }).where(eq(authUsers.personId, personId)).run().changes;
  const retained = erasureCheck(tx, personId, now).retainedInvoices;
  const before = tx.select({ restrictedAt: people.restrictedAt }).from(people).where(eq(people.id, personId)).get();
  tx.update(people)
    .set({
      firstName: '',
      lastName: ANONYMIZED_NAME,
      email: null,
      company: null,
      phone: null,
      restrictedAt: before?.restrictedAt ?? nowIso,
      anonymizedAt: nowIso,
      updatedAt: nowIso,
    })
    .where(eq(people.id, personId))
    .run();
  const result = {
    registrations: regIds.length,
    consents: consentCount,
    sponsorContacts: contactCount,
    speakers: speakerCount,
    accounts: accountCount,
    retainedInvoices: retained,
  };
  writeAudit(tx, actor, {
    action: 'person.anonymized',
    entity: 'person',
    entityId: personId,
    summary:
      `${reason === 'retention' ? 'Löschfrist' : 'Anfrage'}; Anmeldungen ${result.registrations}, Einwilligungen ${result.consents}, ` +
      `Sponsor-Kontakte ${result.sponsorContacts}, Speaker ${result.speakers}, Konten ${result.accounts}, aufbewahrte Belege ${result.retainedInvoices}`,
  });
  return result;
}

/** Löschen auf Anfrage: nur ohne laufende Anmeldungen und offene Erstattungen. */
export function erasePerson(db: Db, actor: Actor, personId: number, now = new Date()): AnonymizeResult {
  return db.transaction((tx) => {
    const person = requirePerson(tx, personId);
    if (person.anonymizedAt) throw new ServiceError('CONFLICT', { _form: 'gdprAnonymized' });
    const check = erasureCheck(tx, personId, now);
    if (check.activeRegistrations > 0) throw new ServiceError('CONFLICT', { _form: 'gdprActiveRegistrations' });
    if (check.openRefunds > 0) throw new ServiceError('CONFLICT', { _form: 'gdprOpenRefunds' });
    const result = anonymizePersonTx(tx, actor, personId, now, 'request');
    completeOpenRequests(tx, actor, personId, 'erasure', now.toISOString());
    return result;
  });
}

// ---------------------------------------------------------------------------
// Anfragen Betroffener (D7)
// ---------------------------------------------------------------------------

export type DsrRow = {
  id: number;
  type: DsrType;
  receivedAt: string;
  dueOn: string;
  completedAt: string | null;
  overdue: boolean;
  notes: string | null;
  personId: number | null;
  personName: string | null;
  personEmail: string | null;
  handledByName: string | null;
};

export function listDsrRequests(db: Db, options: { personId?: number; openOnly?: boolean } = {}, now = new Date()): DsrRow[] {
  const today = viennaDate(now.toISOString());
  const where = and(
    options.personId ? eq(dsrRequests.personId, options.personId) : undefined,
    options.openOnly ? isNull(dsrRequests.completedAt) : undefined
  );
  return db
    .select({ r: dsrRequests, firstName: people.firstName, lastName: people.lastName, email: people.email, handledByName: authUsers.name })
    .from(dsrRequests)
    .leftJoin(people, eq(people.id, dsrRequests.personId))
    .leftJoin(authUsers, eq(authUsers.id, dsrRequests.handledBy))
    .where(where)
    .orderBy(sql`${dsrRequests.completedAt} IS NOT NULL`, desc(dsrRequests.receivedAt), desc(dsrRequests.id))
    .all()
    .map(({ r, firstName, lastName, email, handledByName }) => {
      const dueOn = dsrDueDate(r.receivedAt);
      return {
        id: r.id,
        type: r.type,
        receivedAt: r.receivedAt,
        dueOn,
        completedAt: r.completedAt,
        overdue: !r.completedAt && dueOn < today,
        notes: r.notes,
        personId: r.personId,
        personName: lastName != null ? `${firstName ?? ''} ${lastName}`.trim() : null,
        personEmail: email ?? null,
        handledByName: handledByName ?? null,
      };
    });
}

export type DsrInput = { personId: number | null; type: DsrType; receivedAt: string; notes: string | null };

export function createDsrRequest(db: Db, actor: Actor, input: DsrInput, now = new Date()): number {
  if (input.receivedAt > viennaDate(now.toISOString())) throw new ServiceError('INVALID', { receivedAt: 'notInFuture' });
  return db.transaction((tx) => {
    if (input.personId != null) requirePerson(tx, input.personId);
    const row = tx
      .insert(dsrRequests)
      .values({ personId: input.personId, type: input.type, receivedAt: input.receivedAt, notes: input.notes, handledBy: actor.userId })
      .returning({ id: dsrRequests.id })
      .get();
    writeAudit(tx, actor, {
      action: 'dsr_request.created',
      entity: 'dsr_request',
      entityId: row.id,
      summary: `Typ ${input.type}, eingegangen ${input.receivedAt}${input.personId ? `, Person #${input.personId}` : ''}`,
    });
    return row.id;
  });
}

export function completeDsrRequest(db: Db, actor: Actor, id: number, now = new Date()): void {
  db.transaction((tx) => {
    const row = tx.select().from(dsrRequests).where(eq(dsrRequests.id, id)).get();
    if (!row) throw new ServiceError('NOT_FOUND');
    if (row.completedAt) return;
    tx.update(dsrRequests).set({ completedAt: now.toISOString(), handledBy: actor.userId }).where(eq(dsrRequests.id, id)).run();
    writeAudit(tx, actor, { action: 'dsr_request.completed', entity: 'dsr_request', entityId: id, summary: `Typ ${row.type}` });
  });
}

/** Anzahl offener Anfragen und davon überfälliger (für Hinweise in der Oberfläche). */
export function dsrOpenCounts(db: Db, now = new Date()): { open: number; overdue: number } {
  const open = listDsrRequests(db, { openOnly: true }, now);
  return { open: open.length, overdue: open.filter((r) => r.overdue).length };
}
