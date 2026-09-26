/**
 * Konsistente Sicherung der Datenbank (auch im laufenden Betrieb) nach BACKUP_DIR.
 * Aufruf: npm run db:backup
 */
import { loadEnv } from './lib/env';
import { backupDatabase } from '../src/server/db/backup';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';

loadEnv();
const db = openDatabase({ path: databasePathFromEnv(), backupDir: backupDirFromEnv() });
try {
  const target = backupDatabase(db.$client, backupDirFromEnv());
  console.log(`Sicherung erstellt: ${target}`);
} finally {
  db.$client.close();
}
