/**
 * Mitgliederliste (Spezifikation 4.3): Datei einlesen (CSV/XLSX), prüfen, Unterschiede ermitteln,
 * Liste komplett ersetzen; Prüfung der Mitgliedschaft bei der Anmeldung (Spezifikation 3.1).
 */
import ExcelJS from 'exceljs';
import { count, desc, eq, sql } from 'drizzle-orm';
import Papa from 'papaparse';
import type { Db } from '@/server/db/core';
import { memberImports, members } from '@/server/db/schema';
import { writeAudit, type Actor, type Tx } from './audit';

export const MAX_MEMBER_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_MEMBER_ROWS = 20000;

export type MemberRow = {
  memberNumber: string;
  lastName: string;
  firstName: string | null;
  email: string | null;
  /** YYYY-MM-DD */
  validUntil: string | null;
};

export type MemberParseError = {
  /** Zeilennummer in der Datei (Kopfzeile = 1) oder 0 für Fehler der ganzen Datei */
  line: number;
  code: 'fileType' | 'fileTooLarge' | 'tooManyRows' | 'empty' | 'missingColumns' | 'required' | 'duplicate' | 'invalidDate' | 'invalidEmail' | 'tooLong';
  column?: 'memberNumber' | 'lastName' | 'validUntil' | 'email' | 'firstName';
  value?: string;
};

export type MemberParseResult = { rows: MemberRow[]; errors: MemberParseError[] };

type Column = keyof MemberRow;

/** Erkannte Spaltenüberschriften (klein, ohne Leer- und Sonderzeichen). */
const HEADER_ALIASES: Record<Column, string[]> = {
  memberNumber: ['mitgliedsnummer', 'mitgliedsnr', 'mitgliedernummer', 'nummer', 'nr', 'membernumber', 'memberno', 'memberid', 'pminumber', 'pmiid', 'id'],
  lastName: ['nachname', 'familienname', 'name', 'lastname', 'surname', 'familyname'],
  firstName: ['vorname', 'firstname', 'givenname'],
  email: ['email', 'emailadresse', 'mail'],
  validUntil: ['gueltigbis', 'gultigbis', 'gültigbis', 'mitgliedbis', 'validuntil', 'expires', 'expiry', 'expirydate', 'bis'],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9ü]/g, '');
}

function mapHeaders(headers: string[]): Partial<Record<Column, number>> {
  const map: Partial<Record<Column, number>> = {};
  headers.forEach((h, i) => {
    const n = normalizeHeader(h);
    for (const col of Object.keys(HEADER_ALIASES) as Column[]) {
      if (map[col] === undefined && HEADER_ALIASES[col].map(normalizeHeader).includes(n)) {
        map[col] = i;
        return;
      }
    }
  });
  return map;
}

/** Datum als YYYY-MM-DD aus Text (YYYY-MM-DD, DD.MM.YYYY, D.M.YY) oder Excel-Datum. */
export function parseDateCell(value: unknown): string | null | 'invalid' {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'invalid';
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (s === '') return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (y < 100) y += 2000;
  } else return 'invalid';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return 'invalid';
  return date.toISOString().slice(0, 10);
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (typeof v.text === 'string') return v.text;
    if (v.result != null) return String(v.result);
  }
  return String(value);
}

function decodeText(buffer: Buffer): string {
  let text = new TextDecoder('utf-8').decode(buffer);
  // Excel speichert CSV unter Windows oft als Windows-1252
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer);
  return text.replace(/^﻿/, '');
}

async function readTable(buffer: Buffer, fileName: string): Promise<unknown[][] | 'fileType'> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const parsed = Papa.parse<string[]>(decodeText(buffer), { skipEmptyLines: 'greedy' });
    return parsed.data;
  }
  if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      rows.push(values.slice(1)); // exceljs: Index 0 ist leer
    });
    return rows;
  }
  return 'fileType';
}

export async function parseMemberFile(buffer: Buffer, fileName: string): Promise<MemberParseResult> {
  if (buffer.byteLength > MAX_MEMBER_FILE_BYTES) return { rows: [], errors: [{ line: 0, code: 'fileTooLarge' }] };
  const table = await readTable(buffer, fileName);
  if (table === 'fileType') return { rows: [], errors: [{ line: 0, code: 'fileType' }] };
  if (table.length < 2) return { rows: [], errors: [{ line: 0, code: 'empty' }] };
  if (table.length - 1 > MAX_MEMBER_ROWS) return { rows: [], errors: [{ line: 0, code: 'tooManyRows' }] };

  const map = mapHeaders(table[0].map(cellText));
  if (map.memberNumber === undefined || map.lastName === undefined) {
    return { rows: [], errors: [{ line: 1, code: 'missingColumns' }] };
  }

  const rows: MemberRow[] = [];
  const errors: MemberParseError[] = [];
  const seen = new Map<string, number>();
  const get = (r: unknown[], col: Column) => (map[col] === undefined ? '' : cellText(r[map[col]!]).trim());

  table.slice(1).forEach((raw, i) => {
    const line = i + 2;
    if (raw.every((c) => cellText(c).trim() === '')) return;
    const memberNumber = get(raw, 'memberNumber');
    const lastName = get(raw, 'lastName');
    const firstName = get(raw, 'firstName');
    const email = get(raw, 'email').toLowerCase();
    const validRaw = map.validUntil === undefined ? null : raw[map.validUntil];
    const before = errors.length;
    const report = (e: Omit<MemberParseError, 'line'>) => errors.push({ line, ...e });
    if (!memberNumber) report({ code: 'required', column: 'memberNumber' });
    if (!lastName) report({ code: 'required', column: 'lastName' });
    if (memberNumber.length > 50 || lastName.length > 100 || firstName.length > 100) report({ code: 'tooLong' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) report({ code: 'invalidEmail', column: 'email', value: email });
    const validUntil = parseDateCell(validRaw instanceof Date ? validRaw : cellText(validRaw));
    if (validUntil === 'invalid') report({ code: 'invalidDate', column: 'validUntil', value: cellText(validRaw) });
    const key = memberNumber.toLowerCase();
    if (memberNumber && seen.has(key)) report({ code: 'duplicate', column: 'memberNumber', value: memberNumber });
    const ok = errors.length === before;
    if (memberNumber) seen.set(key, line);
    if (ok) {
      rows.push({
        memberNumber,
        lastName,
        firstName: firstName || null,
        email: email || null,
        validUntil: validUntil === 'invalid' ? null : validUntil,
      });
    }
  });
  if (rows.length === 0 && errors.length === 0) errors.push({ line: 0, code: 'empty' });
  return { rows, errors };
}

export type MemberDiff = { added: number; updated: number; removed: number; unchanged: number };

export function diffMembers(db: Db | Tx, rows: MemberRow[]): MemberDiff {
  const current = new Map(db.select().from(members).all().map((m) => [m.memberNumber.toLowerCase(), m]));
  let added = 0,
    updated = 0,
    unchanged = 0;
  for (const r of rows) {
    const c = current.get(r.memberNumber.toLowerCase());
    if (!c) added++;
    else {
      const same =
        c.memberNumber === r.memberNumber && c.lastName === r.lastName && c.firstName === r.firstName && c.email === r.email && c.validUntil === r.validUntil;
      if (same) unchanged++;
      else updated++;
      current.delete(r.memberNumber.toLowerCase());
    }
  }
  return { added, updated, removed: current.size, unchanged };
}

/** Ersetzt die Mitgliederliste vollständig (Spezifikation 4.3, 7.5) und protokolliert den Import. */
export function replaceMembers(db: Db, actor: Actor, rows: MemberRow[], fileName: string): MemberDiff {
  return db.transaction((tx) => {
    const diff = diffMembers(tx, rows);
    const now = new Date().toISOString();
    // Verknüpfungen lösen, Liste ersetzen, dann über die eingegebene Mitgliedsnummer neu verknüpfen
    tx.run(sql`UPDATE registrations SET member_id = NULL WHERE member_id IS NOT NULL`);
    tx.delete(members).run();
    for (let i = 0; i < rows.length; i += 500) {
      tx.insert(members)
        .values(rows.slice(i, i + 500).map((r) => ({ ...r, importedAt: now })))
        .run();
    }
    tx.run(sql`UPDATE registrations SET member_id = (
      SELECT m.id FROM members m WHERE lower(m.member_number) = lower(trim(registrations.member_number_entered))
    ) WHERE member_number_entered IS NOT NULL AND ticket_type = 'member'`);
    tx.insert(memberImports)
      .values({
        uploadedBy: actor.userId,
        fileName: fileName.slice(0, 200),
        rowCount: rows.length,
        addedCount: diff.added,
        updatedCount: diff.updated,
        removedCount: diff.removed,
      })
      .run();
    writeAudit(tx, actor, {
      action: 'members.imported',
      entity: 'members',
      summary: `Mitgliederliste ersetzt: ${rows.length} Einträge (+${diff.added} / geändert ${diff.updated} / −${diff.removed})`,
    });
    return diff;
  });
}

export function countMembers(db: Db): number {
  return db.select({ n: count() }).from(members).get()?.n ?? 0;
}

export function latestMemberImport(db: Db) {
  return db.select().from(memberImports).orderBy(desc(memberImports.id)).limit(1).get();
}

export function searchMembers(db: Db, query: string, limit = 200) {
  const q = query.trim().toLowerCase();
  const all = db.select().from(members).all();
  const hit = q
    ? all.filter((m) => `${m.memberNumber} ${m.lastName} ${m.firstName ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q))
    : all;
  return {
    total: hit.length,
    rows: hit.sort((a, b) => a.lastName.localeCompare(b.lastName, 'de') || a.memberNumber.localeCompare(b.memberNumber)).slice(0, limit),
  };
}

/**
 * Mitgliedschaft prüfen: Nummer und Nachname müssen übereinstimmen (Groß-/Kleinschreibung und
 * Leerzeichen egal); ist „gültig bis“ gesetzt, muss es am Stichtag (Wiener Kalendertag) noch gelten.
 */
export function findValidMember(db: Db, memberNumber: string, lastName: string, onDate: string) {
  const number = memberNumber.trim();
  if (!number || !lastName.trim()) return undefined;
  const m = db
    .select()
    .from(members)
    .where(eq(sql`lower(${members.memberNumber})`, number.toLowerCase()))
    .get();
  if (!m) return undefined;
  const norm = (s: string) => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
  if (norm(m.lastName) !== norm(lastName)) return undefined;
  if (m.validUntil && m.validUntil < onDate) return undefined;
  return m;
}
