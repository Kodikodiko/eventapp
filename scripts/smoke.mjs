// Smoke-Test: startet den Produktionsserver (vorher `npm run build`), ruft Seiten auf,
// prüft Statuscodes und Inhalte und beendet den Server wieder.
// Aufruf: npm run smoke
import { spawn } from 'node:child_process';

const PORT = process.env.SMOKE_PORT ?? '3100';
const BASE = `http://127.0.0.1:${PORT}`;

/** @type {{ path: string, status: number, contains?: string, location?: string }[]} */
const checks = [
  { path: '/', status: 307, location: '/de' },
  { path: '/de', status: 200, contains: 'Zum Admin-Bereich' },
  { path: '/en', status: 200, contains: 'Go to admin area' },
  { path: '/de/admin', status: 307, location: '/de/admin/login' },
  { path: '/en/admin/security', status: 307, location: '/en/admin/login' },
  { path: '/de/admin/events', status: 307, location: '/de/admin/login' },
  { path: '/de/admin/events/1/settings', status: 307, location: '/de/admin/login' },
  { path: '/en/admin/settings', status: 307, location: '/en/admin/login' },
  { path: '/de/admin/members', status: 307, location: '/de/admin/login' },
  { path: '/de/admin/events/1/speakers', status: 307, location: '/de/admin/login' },
  { path: '/en/admin/events/1/schedule/print', status: 307, location: '/en/admin/login' },
  { path: '/de/admin/login', status: 200, contains: 'Anmelden' },
  { path: '/en/admin/login', status: 200, contains: 'Sign in' },
  { path: '/api/auth/get-session', status: 200, contains: 'null' },
  { path: '/de/gibt-es-nicht', status: 404, contains: 'Seite nicht gefunden' },
  { path: '/en/does-not-exist', status: 404, contains: 'Page not found' },
  { path: '/api/health', status: 200, contains: '"status":"ok"' },
  { path: '/de/admin/events/1/attendees', status: 307, location: '/de/admin/login' },
  { path: '/api/export/registrations?event=1', status: 403 },
  { path: '/de/admin/events/1/sponsors', status: 307, location: '/de/admin/login' },
  { path: '/de/admin/audit', status: 307, location: '/de/admin/login' },
  { path: '/de/privacy', status: 200, contains: 'Datenschutz' },
  { path: '/en/imprint', status: 200, contains: 'Imprint' },
  { path: '/de/events/gibt-es-nicht', status: 404, contains: 'Seite nicht gefunden' },
  { path: '/en/events/does-not-exist/register', status: 404, contains: 'Page not found' },
];

const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', PORT, '-H', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  // eigene, wegwerfbare Datenbank für den Smoke-Test
  env: {
    ...process.env,
    DATABASE_PATH: 'data/smoke/smoke.db',
    BACKUP_DIR: 'data/smoke/backups',
    BETTER_AUTH_SECRET: 'smoke-test-secret-'.padEnd(48, 'x'),
    BETTER_AUTH_URL: BASE,
  },
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(BASE, { redirect: 'manual' });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Server nicht erreichbar:\n' + serverLog);
}

let failed = 0;
try {
  await waitForServer();
  for (const c of checks) {
    const res = await fetch(BASE + c.path, { redirect: 'manual' });
    const body = await res.text();
    const problems = [];
    if (res.status !== c.status) problems.push(`Status ${res.status} statt ${c.status}`);
    if (c.contains && !body.includes(c.contains)) problems.push(`Text "${c.contains}" fehlt`);
    if (c.location) {
      const loc = res.headers.get('location') ?? '';
      if (!loc.endsWith(c.location)) problems.push(`Weiterleitung nach "${loc}" statt "${c.location}"`);
    }
    if (problems.length) {
      failed++;
      console.log(`FEHLER  ${c.path}: ${problems.join('; ')}`);
    } else {
      console.log(`ok      ${c.path}`);
    }
  }
} catch (e) {
  failed++;
  console.log(String(e));
} finally {
  server.kill();
}
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
