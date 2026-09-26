import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '@/server/db/core';
import { appliedMigrationIds, loadMigrations } from '@/server/db/migrate';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');
const quiet = () => {};

const tmpDirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-test-'));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function memoryDb(): Db {
  return openDatabase({ path: ':memory:', log: quiet });
}

function tableNames(db: Db): string[] {
  return (
    db.$client.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  ).map((r) => r.name);
}

describe('Migrationen', () => {
  it('legen alle Tabellen an und werden protokolliert', () => {
    const db = memoryDb();
    const names = tableNames(db);
    for (const t of [
      'organizer_settings', 'events', 'cancellation_rules', 'legal_documents', 'roles', 'people',
      'members', 'member_imports', 'registrations', 'registration_roles', 'waitlist_offers', 'consents',
      'sponsor_packages', 'sponsors', 'sponsor_contacts', 'payments', 'refunds', 'invoices',
      'invoice_counters', 'payment_reminders', 'stripe_events', 'speakers', 'sessions', 'audit_log',
      'dsr_requests', 'app_migrations',
    ]) {
      expect(names).toContain(t);
    }
    const applied = appliedMigrationIds(db.$client);
    expect([...applied].sort()).toEqual(loadMigrations(MIGRATIONS_DIR).map((m) => m.id).sort());
  });

  it('legen die Standardrollen an', () => {
    const db = memoryDb();
    const keys = (db.$client.prepare('SELECT key FROM roles ORDER BY key').all() as { key: string }[]).map((r) => r.key);
    expect(keys).toEqual(['attendee', 'orga', 'speaker', 'sponsor']);
  });

  it('werden beim zweiten Öffnen nicht erneut angewendet', () => {
    const file = path.join(tmpDir(), 'test.db');
    const logs: string[] = [];
    openDatabase({ path: file, backupDir: path.join(path.dirname(file), 'backups'), log: (m) => logs.push(m) }).$client.close();
    const firstRun = logs.length;
    expect(firstRun).toBeGreaterThan(0);
    openDatabase({ path: file, backupDir: path.join(path.dirname(file), 'backups'), log: (m) => logs.push(m) }).$client.close();
    expect(logs.length).toBe(firstRun);
  });

  it('erstellen vor einer neuen Migration eine Sicherung', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'test.db');
    const backups = path.join(dir, 'backups');
    openDatabase({ path: file, backupDir: backups, log: quiet }).$client.close();
    expect(fs.existsSync(backups)).toBe(false); // neue, leere Datenbank: keine Sicherung nötig

    // Kopie der Migrationen mit einer zusätzlichen Test-Migration
    const migDir = path.join(dir, 'drizzle');
    fs.cpSync(MIGRATIONS_DIR, migDir, { recursive: true });
    const journalPath = path.join(migDir, 'meta', '_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    journal.entries.push({ idx: 9999, version: '6', when: Date.now(), tag: '9999_test_extra', breakpoints: true });
    fs.writeFileSync(journalPath, JSON.stringify(journal));
    fs.writeFileSync(path.join(migDir, '9999_test_extra.sql'), 'CREATE TABLE test_extra (x INTEGER);');

    const db = openDatabase({ path: file, backupDir: backups, migrationsDir: migDir, log: quiet });
    expect(tableNames(db)).toContain('test_extra');
    db.$client.close();
    const files = fs.readdirSync(backups);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/vor-9999_test_extra\.db$/);
  });

  it('brechen ab, wenn die Datenbank unbekannte Migrationen enthält', () => {
    const file = path.join(tmpDir(), 'test.db');
    const db = openDatabase({ path: file, log: quiet });
    db.$client.prepare('INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)').run('9999_aus_der_zukunft', 'x');
    db.$client.close();
    expect(() => openDatabase({ path: file, log: quiet })).toThrow(/Migrationen, die der Code nicht kennt/);
  });
});

describe('Schema-Regeln', () => {
  function insertEvent(db: Db): number {
    const r = db.$client
      .prepare(
        `INSERT INTO events (slug, name, starts_at, ends_at, capacity, price_normal_cents, price_member_cents)
         VALUES ('test', '{"de":"Test"}', '2027-05-01T08:00:00.000Z', '2027-05-01T17:00:00.000Z', 10, 14900, 9900)`
      )
      .run();
    return Number(r.lastInsertRowid);
  }
  function insertPerson(db: Db, email: string): number {
    const r = db.$client
      .prepare("INSERT INTO people (first_name, last_name, email) VALUES ('Max', 'Muster', ?)")
      .run(email);
    return Number(r.lastInsertRowid);
  }
  function insertRegistration(db: Db, eventId: number, personId: number, status: string, token: string) {
    return db.$client
      .prepare(
        `INSERT INTO registrations (event_id, person_id, status, payment_status, payment_method, price_cents, source, qr_token)
         VALUES (?, ?, ?, 'open', 'invoice', 14900, 'public', ?)`
      )
      .run(eventId, personId, status, token);
  }

  it('erlauben E-Mail-Adressen nur klein geschrieben', () => {
    const db = memoryDb();
    expect(() => insertPerson(db, 'Max@Example.com')).toThrow(/CHECK/);
    expect(insertPerson(db, 'max@example.com')).toBeGreaterThan(0);
  });

  it('erlauben pro Person und Event nur eine aktive Anmeldung', () => {
    const db = memoryDb();
    const eventId = insertEvent(db);
    const personId = insertPerson(db, 'max@example.com');
    insertRegistration(db, eventId, personId, 'cancelled', 't1');
    insertRegistration(db, eventId, personId, 'confirmed', 't2');
    expect(() => insertRegistration(db, eventId, personId, 'reserved', 't3')).toThrow(/UNIQUE/);
  });

  it('prüfen Fremdschlüssel', () => {
    const db = memoryDb();
    expect(() => insertRegistration(db, 999, 999, 'confirmed', 't1')).toThrow(/FOREIGN KEY/);
  });

  it('verlangen konsistente Rechnungssummen', () => {
    const db = memoryDb();
    const eventId = insertEvent(db);
    const personId = insertPerson(db, 'max@example.com');
    const regId = Number(insertRegistration(db, eventId, personId, 'confirmed', 't1').lastInsertRowid);
    const insert = (net: number, vat: number, gross: number) =>
      db.$client
        .prepare(
          `INSERT INTO invoices (type, number, registration_id, locale, service_date, recipient, organizer, items,
             vat_mode, net_cents, vat_cents, gross_cents, retain_until)
           VALUES ('invoice', ?, ?, 'de', '2027-05-01', '{}', '{}', '[]', 'small_business', ?, ?, ?, '2034-12-31')`
        )
        .run(`2027-${net}`, regId, net, vat, gross);
    expect(() => insert(100, 0, 99)).toThrow(/CHECK/);
    expect(() => insert(14900, 0, 14900)).not.toThrow();
  });
});
