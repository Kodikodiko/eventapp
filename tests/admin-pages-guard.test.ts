import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jede Seite und jedes Layout im Admin-Fachbereich prüft die Anmeldung selbst (initAdminPage).
 * Eine Prüfung nur im übergeordneten Layout lässt sich mit einem selbst gebauten Router-State-Header umgehen:
 * Next.js rendert dann nur die Segmente unterhalb des angeblich schon geladenen Layouts.
 */
const ADMIN_APP_DIR = path.join(process.cwd(), 'src', 'app', '[locale]', '(admin)', 'admin', '(auth)', '(app)');

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return /^(page|layout)\.tsx$/.test(entry.name) ? [full] : [];
  });
}

describe('Admin-Seiten', () => {
  const files = routeFiles(ADMIN_APP_DIR);

  it('findet die Seiten', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(ADMIN_APP_DIR, f), f]))('%s prüft die Anmeldung selbst', (_name, file) => {
    const source = fs.readFileSync(file, 'utf8');
    expect(source).toMatch(/initAdminPage\(|requireAdminWith2fa\(/);
  });
});
