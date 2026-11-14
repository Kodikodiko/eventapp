import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

/**
 * Erstellt eine konsistente Sicherung der (auch laufenden) Datenbank per `VACUUM INTO`.
 * Dateiname: <dbname>-<zeitstempel>[-<label>].db im Zielordner. Gibt den Pfad zurück.
 */
export function backupDatabase(sqlite: Database.Database, targetDir: string, label?: string): string {
  fs.mkdirSync(targetDir, { recursive: true });
  const base = path.basename(sqlite.name, path.extname(sqlite.name)) || 'eventflow';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeLabel = label ? '-' + label.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
  const target = path.resolve(targetDir, `${base}-${stamp}${safeLabel}.db`);
  sqlite.prepare('VACUUM INTO ?').run(target);
  return target;
}

/**
 * Sicherungen (*.db) im Ordner löschen, die älter als `maxAgeDays` sind (Spezifikation 7.5: gelöschte Daten
 * verschwinden spätestens nach 90 Tagen auch aus den Sicherungen). Gibt die Anzahl (bei dryRun: die Anzahl,
 * die gelöscht würde) zurück.
 */
export function pruneBackups(targetDir: string, maxAgeDays: number, options: { now?: Date; dryRun?: boolean } = {}): number {
  const now = options.now ?? new Date();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(targetDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  const cutoff = now.getTime() - maxAgeDays * 24 * 3600 * 1000;
  let count = 0;
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.db')) continue;
    const file = path.join(targetDir, e.name);
    if (fs.statSync(file).mtimeMs >= cutoff) continue;
    if (!options.dryRun) fs.rmSync(file, { force: true });
    count++;
  }
  return count;
}
