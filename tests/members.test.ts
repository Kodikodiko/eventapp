import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '@/server/db/core';
import { memberImports } from '@/server/db/schema';
import {
  countMembers,
  diffMembers,
  findValidMember,
  parseDateCell,
  parseMemberFile,
  replaceMembers,
  searchMembers,
  type MemberRow,
} from '@/server/services/members';

const actor = { userId: 'admin-1' };
const db = (): Db => openDatabase({ path: ':memory:', log: () => {} });
const csv = (text: string, encoding: 'utf8' | 'latin1' = 'utf8') => Buffer.from(text, encoding);

async function xlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mitglieder');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const row = (memberNumber: string, lastName: string, extra: Partial<MemberRow> = {}): MemberRow => ({
  memberNumber,
  lastName,
  firstName: null,
  email: null,
  validUntil: null,
  ...extra,
});

describe('Datum in der Mitgliederliste', () => {
  it('versteht ISO, deutsches Format und Excel-Datum', () => {
    expect(parseDateCell('2027-12-31')).toBe('2027-12-31');
    expect(parseDateCell('31.12.2027')).toBe('2027-12-31');
    expect(parseDateCell('1.2.27')).toBe('2027-02-01');
    expect(parseDateCell(new Date(Date.UTC(2027, 5, 30)))).toBe('2027-06-30');
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('31.02.2027')).toBe('invalid');
    expect(parseDateCell('Ende 2027')).toBe('invalid');
  });
});

describe('Einlesen der Mitgliederliste', () => {
  it('liest CSV mit Semikolon, deutschen Überschriften und BOM', async () => {
    const r = await parseMemberFile(csv('﻿Mitgliedsnummer;Nachname;Vorname;E-Mail;Gültig bis\nM-1;Huber;Anna;Anna@Example.org;31.12.2027\nM-2;Gruber;;;\n'), 'liste.csv');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { memberNumber: 'M-1', lastName: 'Huber', firstName: 'Anna', email: 'anna@example.org', validUntil: '2027-12-31' },
      { memberNumber: 'M-2', lastName: 'Gruber', firstName: null, email: null, validUntil: null },
    ]);
  });

  it('liest CSV mit Komma und englischen Überschriften', async () => {
    const r = await parseMemberFile(csv('Member Number,Last Name,First Name\n1001,Smith,John\n'), 'members.csv');
    expect(r.rows).toEqual([row('1001', 'Smith', { firstName: 'John' })]);
  });

  it('liest Windows-1252-kodierte CSV (Umlaute aus Excel)', async () => {
    const r = await parseMemberFile(csv('Mitgliedsnummer;Nachname\nM-9;Müller\n', 'latin1'), 'liste.csv');
    expect(r.rows[0].lastName).toBe('Müller');
  });

  it('liest XLSX inklusive Datumszellen', async () => {
    const buffer = await xlsx([
      ['Nr', 'Name', 'Vorname', 'gültig bis'],
      ['A-7', 'Wagner', 'Sophie', new Date(Date.UTC(2027, 0, 31))],
      [8, 'Bauer', 'Felix', '30.06.2027'],
    ]);
    const r = await parseMemberFile(buffer, 'liste.xlsx');
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      row('A-7', 'Wagner', { firstName: 'Sophie', validUntil: '2027-01-31' }),
      row('8', 'Bauer', { firstName: 'Felix', validUntil: '2027-06-30' }),
    ]);
  });

  it('meldet Fehler mit Zeilennummer', async () => {
    const r = await parseMemberFile(
      csv('Mitgliedsnummer;Nachname;E-Mail;Gültig bis\nM-1;Huber;;\n;Ohne Nummer;;\nM-1;Doppelt;;\nM-3;Datum;;32.13.2027\nM-4;Mail;kaputt;\n'),
      'liste.csv'
    );
    expect(r.rows.map((x) => x.memberNumber)).toEqual(['M-1']);
    expect(r.errors).toEqual([
      { line: 3, code: 'required', column: 'memberNumber' },
      { line: 4, code: 'duplicate', column: 'memberNumber', value: 'M-1' },
      { line: 5, code: 'invalidDate', column: 'validUntil', value: '32.13.2027' },
      { line: 6, code: 'invalidEmail', column: 'email', value: 'kaputt' },
    ]);
  });

  it('lehnt fehlende Pflichtspalten, leere Dateien und andere Formate ab', async () => {
    expect((await parseMemberFile(csv('Vorname;E-Mail\nAnna;a@b.at\n'), 'x.csv')).errors).toEqual([{ line: 1, code: 'missingColumns' }]);
    expect((await parseMemberFile(csv('Mitgliedsnummer;Nachname\n'), 'x.csv')).errors).toEqual([{ line: 0, code: 'empty' }]);
    expect((await parseMemberFile(csv('x'), 'x.pdf')).errors).toEqual([{ line: 0, code: 'fileType' }]);
  });
});

describe('Ersetzen der Mitgliederliste', () => {
  it('ermittelt Unterschiede und ersetzt die Liste vollständig', () => {
    const d = db();
    replaceMembers(d, actor, [row('M-1', 'Huber'), row('M-2', 'Gruber'), row('M-3', 'Wagner')], 'alt.csv');
    const next = [row('m-1', 'Huber'), row('M-2', 'Gruber-Neu'), row('M-4', 'Bauer')];
    expect(diffMembers(d, next)).toEqual({ added: 1, updated: 2, removed: 1, unchanged: 0 });
    const diff = replaceMembers(d, actor, next, 'neu.csv');
    expect(diff.removed).toBe(1);
    expect(countMembers(d)).toBe(3);
    expect(searchMembers(d, 'gruber').rows[0].lastName).toBe('Gruber-Neu');
    const imports = d.select().from(memberImports).all();
    expect(imports.map((i) => i.fileName)).toEqual(['alt.csv', 'neu.csv']);
  });
});

describe('Prüfung der Mitgliedschaft', () => {
  const setup = () => {
    const d = db();
    replaceMembers(d, actor, [row('M-1001', 'Huber'), row('M-1002', 'Müller', { validUntil: '2027-03-31' })], 'x.csv');
    return d;
  };

  it('verlangt Nummer und Nachname, Groß-/Kleinschreibung egal', () => {
    const d = setup();
    expect(findValidMember(d, ' m-1001 ', 'HUBER', '2027-01-01')?.memberNumber).toBe('M-1001');
    expect(findValidMember(d, 'M-1001', 'Gruber', '2027-01-01')).toBeUndefined();
    expect(findValidMember(d, 'M-9999', 'Huber', '2027-01-01')).toBeUndefined();
    expect(findValidMember(d, '', 'Huber', '2027-01-01')).toBeUndefined();
  });

  it('beachtet „gültig bis“', () => {
    const d = setup();
    expect(findValidMember(d, 'M-1002', 'müller', '2027-03-31')).toBeDefined();
    expect(findValidMember(d, 'M-1002', 'Müller', '2027-04-01')).toBeUndefined();
  });
});
