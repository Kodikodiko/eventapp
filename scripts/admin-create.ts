/**
 * Admin-Konto anlegen oder Passwort zurücksetzen.
 *
 *   npm run admin:create -- --email admin@example.org --name "Anna Admin"
 *   npm run admin:create -- --email admin@example.org --reset-password
 *
 * Das Passwort wird verdeckt abgefragt (mindestens 12 Zeichen). Für automatisierte Abläufe kann es
 * stattdessen über die Umgebungsvariable ADMIN_PASSWORD übergeben werden.
 * Nach der ersten Anmeldung muss der Admin die Zwei-Faktor-Anmeldung einrichten.
 */
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { loadEnv } from './lib/env';
import { upsertAdmin } from '../src/server/auth/admin-users';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';

loadEnv();

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    'reset-password': { type: 'boolean', default: false },
  },
});

if (!values.email) {
  console.error('Bitte --email angeben. Beispiel: npm run admin:create -- --email admin@example.org --name "Anna Admin"');
  process.exit(1);
}
const email: string = values.email;

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const writable = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(question);
    writable._writeToOutput = () => {}; // Eingabe nicht anzeigen
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!process.stdin.isTTY) {
    throw new Error('Kein Terminal für die Passwortabfrage – ADMIN_PASSWORD setzen.');
  }
  const first = await promptHidden('Passwort (mind. 12 Zeichen): ');
  const second = await promptHidden('Passwort wiederholen: ');
  if (first !== second) throw new Error('Die Passwörter stimmen nicht überein.');
  return first;
}

async function main() {
  const db = openDatabase({ path: databasePathFromEnv(), backupDir: backupDirFromEnv() });
  try {
    const password = await readPassword();
    const result = await upsertAdmin(
      db,
      { email: email, name: values.name ?? email.split('@')[0], password },
      { resetPassword: values['reset-password'] }
    );
    console.log(
      result === 'created'
        ? `Admin ${email.toLowerCase()} angelegt. Bei der ersten Anmeldung wird die Zwei-Faktor-Anmeldung eingerichtet.`
        : `Passwort für ${email.toLowerCase()} neu gesetzt.`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    db.$client.close();
  }
}

void main();
