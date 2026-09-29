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

let seedPromise: Promise<void> | null = null;

/**
 * Für Seiten und Layouts: markiert das Rendering als dynamisch (pro Anfrage) und liefert dann die Datenbank.
 * So wird beim Build nie auf die Datenbank zugegriffen.
 */
export async function requestDb(): Promise<Db> {
  await connection();
  const db = getDb();
  if (process.env.AUTO_SEED === 'true') {
    if (!seedPromise) {
      const { seedIfNeeded } = await import('./seed');
      seedPromise = seedIfNeeded(db);
    }
    await seedPromise;
  }
  return db;
}

export type { Db } from './core';
export * as schema from './schema';
