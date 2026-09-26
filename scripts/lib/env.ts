import fs from 'node:fs';

/** Lädt .env.local (falls vorhanden) für Skripte, die außerhalb von Next.js laufen. */
export function loadEnv(file = '.env.local'): void {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
