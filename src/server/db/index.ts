/**
 * Datenbankzugang für die Next.js-App (nur serverseitig).
 * Eine Verbindung pro Prozess; im Entwicklungsmodus über globalThis wiederverwendet,
 * damit Hot Reload keine weiteren Verbindungen öffnet.
 */
import 'server-only';
import { connection } from 'next/server';
import { backupDirFromEnv, databasePathFromEnv, openDatabase, type Db } from './core';

const globalForDb = globalThis as unknown as { __eventflowDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__eventflowDb) {
    globalForDb.__eventflowDb = openDatabase({ path: databasePathFromEnv(), backupDir: backupDirFromEnv() });
  }
  return globalForDb.__eventflowDb;
}

/**
 * Für Seiten und Layouts: markiert das Rendering als dynamisch (pro Anfrage) und liefert dann die Datenbank.
 * So wird beim Build nie auf die Datenbank zugegriffen.
 */
export async function requestDb(): Promise<Db> {
  await connection();
  return getDb();
}

export type { Db } from './core';
export * as schema from './schema';
