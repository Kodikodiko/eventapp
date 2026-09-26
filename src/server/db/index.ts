/**
 * Datenbankzugang für die Next.js-App (nur serverseitig).
 * Eine Verbindung pro Prozess; im Entwicklungsmodus über globalThis wiederverwendet,
 * damit Hot Reload keine weiteren Verbindungen öffnet.
 */
import 'server-only';
import { backupDirFromEnv, databasePathFromEnv, openDatabase, type Db } from './core';

const globalForDb = globalThis as unknown as { __eventflowDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__eventflowDb) {
    globalForDb.__eventflowDb = openDatabase({ path: databasePathFromEnv(), backupDir: backupDirFromEnv() });
  }
  return globalForDb.__eventflowDb;
}

export type { Db } from './core';
export * as schema from './schema';
