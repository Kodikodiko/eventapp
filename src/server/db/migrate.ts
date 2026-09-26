/**
 * Migrationsmechanismus (nach dem Vorbild von „vermietung“):
 * - Die SQL-Migrationen erzeugt `drizzle-kit generate` aus schema.ts in den Ordner drizzle/.
 * - Beim Öffnen der Datenbank werden alle noch nicht angewendeten Migrationen in Reihenfolge
 *   eingespielt – jede in einer eigenen Transaktion und genau einmal (Tabelle app_migrations).
 * - Vor dem Einspielen wird über `beforeApply` eine Sicherung angelegt.
 * - Schlägt eine Migration fehl, bleibt die Datenbank auf dem vorherigen Stand und der Start bricht ab.
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

type Journal = { entries: { idx: number; tag: string }[] };

export type Migration = { id: string; statements: string[] };

export type RunMigrationsOptions = {
  migrationsDir: string;
  log?: (message: string) => void;
  /** wird vor dem Einspielen mit den IDs der offenen Migrationen aufgerufen */
  beforeApply?: (pendingIds: string[]) => void;
};

/** Liest die Migrationen in der Reihenfolge des Drizzle-Journals. */
export function loadMigrations(migrationsDir: string): Migration[] {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) throw new Error(`Migrationsjournal fehlt: ${journalPath}`);
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => {
      const sqlText = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), 'utf8');
      const statements = sqlText
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return { id: entry.tag, statements };
    });
}

export function appliedMigrationIds(sqlite: Database.Database): Set<string> {
  ensureMigrationsTable(sqlite);
  const rows = sqlite.prepare('SELECT id FROM app_migrations').all() as { id: string }[];
  return new Set(rows.map((r) => r.id));
}

/** Spielt offene Migrationen ein und gibt die IDs der angewendeten zurück. */
export function runMigrations(sqlite: Database.Database, options: RunMigrationsOptions): string[] {
  const log = options.log ?? (() => {});
  const all = loadMigrations(options.migrationsDir);
  const applied = appliedMigrationIds(sqlite);

  const unknown = [...applied].filter((id) => !all.some((m) => m.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `Die Datenbank enthält Migrationen, die der Code nicht kennt (${unknown.join(', ')}). ` +
        'Wahrscheinlich ist die Datenbank neuer als dieser Programmstand.'
    );
  }

  const pending = all.filter((m) => !applied.has(m.id));
  if (pending.length === 0) return [];

  options.beforeApply?.(pending.map((m) => m.id));

  const done: string[] = [];
  sqlite.pragma('foreign_keys = OFF');
  try {
    for (const migration of pending) {
      const apply = sqlite.transaction(() => {
        // erneut prüfen: schützt, falls mehrere Prozesse gleichzeitig starten
        const already = sqlite.prepare('SELECT 1 FROM app_migrations WHERE id = ?').get(migration.id);
        if (already) return false;
        for (const statement of migration.statements) sqlite.exec(statement);
        sqlite
          .prepare('INSERT INTO app_migrations (id, applied_at) VALUES (?, ?)')
          .run(migration.id, new Date().toISOString());
        return true;
      });
      if (apply.immediate()) {
        done.push(migration.id);
        log(`[DB] Migration angewendet: ${migration.id}`);
      }
    }
    const fkErrors = sqlite.pragma('foreign_key_check') as unknown[];
    if (fkErrors.length > 0) {
      throw new Error(`Fremdschlüssel-Prüfung nach Migration fehlgeschlagen: ${JSON.stringify(fkErrors)}`);
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  return done;
}

function ensureMigrationsTable(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS app_migrations (
    id TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL
  )`);
}
