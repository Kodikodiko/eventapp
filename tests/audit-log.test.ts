import { describe, expect, it } from 'vitest';
import { auditFilterQuery, parseAuditFilter } from '@/lib/audit-filter';
import { openDatabase, type Db } from '@/server/db/core';
import { auditLog, authUsers } from '@/server/db/schema';
import { AUDIT_PAGE_SIZE, auditFilterOptions, listAuditEntries } from '@/server/services/audit-log';

const empty = parseAuditFilter({});

function setup() {
  const db: Db = openDatabase({ path: ':memory:', log: () => {} });
  const now = new Date();
  db.insert(authUsers).values({ id: 'u1', name: 'Anna Admin', email: 'anna@example.org', createdAt: now, updatedAt: now } as typeof authUsers.$inferInsert).run();
  const add = (at: string, o: Partial<typeof auditLog.$inferInsert> = {}) =>
    db.insert(auditLog).values({ at, action: 'event.updated', entity: 'event', entityId: '1', summary: 'Event summit', actorUserId: 'u1', ...o }).run();
  add('2027-03-30T21:30:00.000Z'); // 30.03. 23:30 Wien (Sommerzeit)
  add('2027-03-30T22:30:00.000Z', { action: 'sponsor.created', entity: 'sponsor', entityId: '7', summary: 'Sponsor 100%_Rabatt AG' }); // 31.03. 00:30 Wien
  add('2027-04-02T08:00:00.000Z', { actorUserId: null, action: 'members.imported', entity: 'members', entityId: null, summary: 'Import 10 Zeilen' });
  add('2027-04-03T08:00:00.000Z', { actorUserId: 'geloescht', summary: 'alter Admin' });
  return db;
}

describe('Filter aus der URL', () => {
  it('ignoriert ungültige Werte und baut die URL zurück', () => {
    const f = parseAuditFilter({ q: ' abc ', event: 'x', entity: 'DROP TABLE', from: '2027-01-01', to: '31.01.2027', page: '3', actor: ['system', 'u1'] });
    expect(f).toEqual({ q: 'abc', eventId: null, entity: '', actor: 'system', from: '2027-01-01', to: '', page: 3 });
    expect(auditFilterQuery(f, 2)).toEqual({ q: 'abc', actor: 'system', from: '2027-01-01', page: '2' });
    expect(auditFilterQuery(empty)).toEqual({});
  });
});

describe('Audit-Log lesen', () => {
  it('neueste zuerst, mit Admin-Namen; System und gelöschte Admins erkennbar', () => {
    const db = setup();
    const { rows, total, pages } = listAuditEntries(db, empty);
    expect(total).toBe(4);
    expect(pages).toBe(1);
    expect(rows.map((r) => r.summary)).toEqual(['alter Admin', 'Import 10 Zeilen', 'Sponsor 100%_Rabatt AG', 'Event summit']);
    expect(rows[0]).toMatchObject({ actorUserId: 'geloescht', actorName: null });
    expect(rows[1]).toMatchObject({ actorUserId: null });
    expect(rows[3].actorName).toBe('Anna Admin');
  });

  it('filtert nach Bereich, Admin, System und Wiener Kalendertagen', () => {
    const db = setup();
    expect(listAuditEntries(db, { ...empty, entity: 'sponsor' }).total).toBe(1);
    expect(listAuditEntries(db, { ...empty, actor: 'system' }).rows[0].action).toBe('members.imported');
    expect(listAuditEntries(db, { ...empty, actor: 'u1' }).total).toBe(2);
    const day = listAuditEntries(db, { ...empty, from: '2027-03-31', to: '2027-03-31' });
    expect(day.rows.map((r) => r.entityId)).toEqual(['7']);
    expect(listAuditEntries(db, { ...empty, to: '2027-03-30' }).total).toBe(1);
  });

  it('sucht in Beschreibung, Aktion und ID – % und _ wörtlich', () => {
    const db = setup();
    expect(listAuditEntries(db, { ...empty, q: '100%_' }).total).toBe(1);
    expect(listAuditEntries(db, { ...empty, q: '%' }).total).toBe(1);
    expect(listAuditEntries(db, { ...empty, q: 'IMPORTED' }).total).toBe(1);
    expect(listAuditEntries(db, { ...empty, q: '7' }).total).toBe(1);
  });

  it('blättert seitenweise und begrenzt die Seite', () => {
    const db = setup();
    for (let i = 0; i < AUDIT_PAGE_SIZE; i++) {
      db.insert(auditLog).values({ at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`, action: 'x.y', entity: 'x', summary: `alt ${i}` }).run();
    }
    const p2 = listAuditEntries(db, { ...empty, page: 2 });
    expect(p2.pages).toBe(2);
    expect(p2.rows).toHaveLength(4);
    expect(listAuditEntries(db, { ...empty, page: 99 }).rows).toHaveLength(4);
  });

  it('liefert Auswahlwerte für die Filter', () => {
    const db = setup();
    const o = auditFilterOptions(db);
    expect(o.entities).toEqual(['event', 'members', 'sponsor']);
    expect(o.actors).toEqual([
      { id: 'u1', name: 'Anna Admin' },
      { id: 'geloescht', name: 'geloescht' },
    ]);
  });
});
