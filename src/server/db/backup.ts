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
