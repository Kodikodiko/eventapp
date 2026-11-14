/**
 * Löschfristen anwenden (Spezifikation 7.5): npm run retention [-- --dry-run]
 * Produktiv täglich; läuft außerdem einmal am Tag automatisch mit `npm run jobs`.
 * Ausgabe nur Zahlen, keine Personendaten. Jeder Lauf steht im Audit-Log (nicht beim Probelauf).
 */
import { loadEnv } from './lib/env';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';
import { invoiceDir } from '../src/server/invoices/storage';
import { formatRetentionSummary, runRetention } from '../src/server/services/retention';

loadEnv();
const dryRun = process.argv.includes('--dry-run');
const db = openDatabase({ path: databasePathFromEnv(), backupDir: backupDirFromEnv() });
try {
  const s = runRetention(db, { dryRun, backupDir: backupDirFromEnv(), invoiceDir: invoiceDir() });
  console.log(`[retention] ${new Date().toISOString()}${dryRun ? ' PROBELAUF (nichts geändert)' : ''} ${formatRetentionSummary(s)}`);
} catch (error) {
  console.error('[retention] Fehler', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  db.$client.close();
}
