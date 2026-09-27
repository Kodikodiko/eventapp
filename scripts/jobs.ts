/**
 * Zeitgesteuerte Abläufe einmal ausführen: abgelaufene Reservierungen freigeben, Wartelisten-Angebote
 * weitergeben/verschicken. Aufruf: npm run jobs (produktiv per systemd-Timer alle 5 Minuten).
 * Ausgabe nur Zahlen, keine Personendaten.
 */
import { loadEnv } from './lib/env';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';
import { runJobs } from '../src/server/services/automation';

async function main() {
  loadEnv();
  const db = openDatabase({ path: databasePathFromEnv(), backupDir: backupDirFromEnv() });
  try {
    const s = await runJobs(db);
    console.log(
      `[jobs] ${new Date().toISOString()} Reservierungen freigegeben: ${s.expiredReservations}, Angebote verfallen: ${s.expiredOffers}, Angebote verschickt: ${s.offered}, E-Mail-Fehler: ${s.mailFailures}`
    );
    if (s.mailFailures > 0) process.exitCode = 1;
  } finally {
    db.$client.close();
  }
}

main().catch((error) => {
  console.error('[jobs] Fehler', error instanceof Error ? error.message : error);
  process.exit(1);
});
