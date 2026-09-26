# EventFlow

Eventverwaltung für Veranstalter: mehrere Events, öffentliche Anmeldung mit Mitgliederpreis, Zahlung per Stripe
oder Rechnung, Warteliste, Storno und Erstattung, Speaker, Sponsoren, Programm – zweisprachig (Deutsch/Englisch)
und DSGVO-konform.

> **Status:** Migration von Firebase auf Next.js + SQLite läuft (Branch `migration/sqlite`).
> Plan und Fortschritt: [`MIGRATIONSPLAN.md`](MIGRATIONSPLAN.md) · offene Punkte: [`TODO.md`](TODO.md) ·
> Änderungen: [`CHANGELOG.md`](CHANGELOG.md)

**Technik:** Next.js 16 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS 4 · ShadCN UI ·
next-intl · SQLite (better-sqlite3) · Drizzle ORM · Vitest

## Schnellstart (Windows, lokal)

```powershell
npm ci
copy .env.example .env.local   # Werte eintragen
npm run seed:demo              # optional: Demodaten in eine leere Datenbank
npm run admin:create -- --email du@example.org --name "Dein Name"
npm run dev                    # http://localhost:3000/de/admin
```

Die Datenbank liegt standardmäßig in `data/eventflow.db` und wird beim Start automatisch angelegt bzw. migriert.
Ausführlich: [`DEPLOYMENT.md`](DEPLOYMENT.md) (lokale Entwicklung und späterer Betrieb auf einem EU-VPS ohne Docker).

## Qualität

```powershell
npm run typecheck; npm run lint; npm test          # vor jedem Commit
npm run build; npm run smoke                       # Produktions-Build prüfen
```

## Verzeichnisse

| Pfad | Inhalt |
|---|---|
| `src/app/[locale]/` | Seiten (öffentlich, Portal, Admin) je Sprache |
| `src/app/api/` | Route Handler (Health-Check; später Auth, Stripe-Webhook, Exporte) |
| `src/server/` | nur serverseitig: Datenbank (`db/`), Anmeldung und Rechte (`auth/`), später Services und Server Actions |
| `src/components/` | UI-Komponenten (ShadCN) und fachliche Komponenten |
| `src/lib/` | Hilfen: Geldbeträge (`money.ts`), mehrsprachige Inhalte (`localized.ts`) |
| `src/i18n/` | Sprachkonfiguration; Übersetzungen in `messages/de.json` und `messages/en.json` |
| `drizzle/` | SQL-Migrationen (von `npm run db:generate` erzeugt) |
| `scripts/` | Kommandozeilen-Skripte (Demodaten, Sicherung, Smoke-Test) |
| `tests/` | Vitest-Tests |
| `legacy/` | alter Firebase-Stand als Vorlage für die Portierung – wird am Ende gelöscht |

## Wichtige Regeln

- **Geldbeträge** immer als ganze **Cent** (`*_cents`), Steuersätze in Basispunkten (2000 = 20 %); Umrechnung und
  Formatierung nur über `src/lib/money.ts`.
- **Zeitstempel** als ISO-8601 in UTC speichern, in Europe/Vienna anzeigen.
- **Schema-Änderungen:** `src/server/db/schema.ts` anpassen → `npm run db:generate` → neue Datei in `drizzle/`
  committen. Bestehende Migrationen nie ändern. Eingespielt wird automatisch beim Start, mit Sicherung vorher.
- **Datenbankzugriff** nur auf dem Server (`src/server/`); der Browser spricht nie direkt mit der Datenbank.
- **Mehrsprachige Inhalte** als `{ de, en? }` speichern und mit `localized()` ausgeben; Texte der Oberfläche in
  `messages/*.json`.
- **Keine echten Personendaten** ins Repository; für Tests und Vorführungen `npm run seed:demo`.
