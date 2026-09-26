/**
 * Datenbank-Kern ohne Next.js-Abhängigkeiten – wird von der App (über ./index.ts),
 * von Skripten (scripts/) und von Tests verwendet.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { backupDatabase } from './backup';
import { runMigrations } from './migrate';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export type OpenDbOptions = {
  /** Pfad zur Datenbankdatei; ':memory:' für Tests */
  path: string;
  /** Ordner für automatische Sicherungen vor Migrationen */
  backupDir?: string;
  /** Ordner mit den Drizzle-Migrationen (Standard: <cwd>/drizzle) */
  migrationsDir?: string;
  /** Protokollausgabe (Standard: console.log) */
  log?: (message: string) => void;
};

export function databasePathFromEnv(): string {
  return process.env.DATABASE_PATH || path.join('data', 'eventflow.db');
}

export function backupDirFromEnv(): string {
  return process.env.BACKUP_DIR || path.join(path.dirname(databasePathFromEnv()), 'backups');
}

/**
 * Öffnet die Datenbank, setzt die Betriebsparameter und spielt offene Migrationen ein
 * (vorher Sicherung, falls die Datenbank schon Tabellen enthält).
 */
export function openDatabase(options: OpenDbOptions): Db {
  const log = options.log ?? ((m: string) => console.log(m));
  const isMemory = options.path === ':memory:';
  if (!isMemory) fs.mkdirSync(path.dirname(path.resolve(options.path)), { recursive: true });

  const sqlite = new Database(options.path);
  if (!isMemory) sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  try {
    runMigrations(sqlite, {
      migrationsDir: options.migrationsDir ?? path.join(process.cwd(), 'drizzle'),
      log,
      beforeApply: (pending) => {
        if (isMemory || !hasUserTables(sqlite)) return;
        const target = backupDatabase(sqlite, options.backupDir ?? backupDirFromEnv(), `vor-${pending[0]}`);
        log(`[DB] Sicherung vor Migration erstellt: ${target}`);
      },
    });
  } catch (error) {
    // Verbindung schließen, damit die Datei nicht gesperrt bleibt (Windows)
    sqlite.close();
    throw error;
  }

  sqlite.pragma('foreign_keys = ON');
  return drizzle({ client: sqlite, schema }) as Db;
}

function hasUserTables(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT IN ('app_migrations', 'sqlite_sequence')"
    )
    .get() as { n: number };
  return row.n > 0;
}
