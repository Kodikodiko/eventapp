# Changelog

## 27.09.2026 – Phase 5: Öffentliche Anmeldung

- Öffentlicher Bereich mit eigener Kopf- und Fußzeile: Startseite mit kommenden Veranstaltungen, Eventseite `/de/events/<kurzname>` mit Termin, Ort, Beschreibung, Programm (Speaker nur mit bestätigtem Beitrag), Speakern, Sponsoren nach Paket, Preisen und Anmeldestatus („nur noch x Plätze“, „ausgebucht – Warteliste“, „öffnet am …“, „geschlossen“).
- Anmeldeformular (DE/EN): Stammdaten, Mitgliedsnummer mit Live-Preisprüfung (Nummer + Nachname), Zahlungsart, bei Rechnung Pflicht für Firma und Adresse (Firma wird vorbelegt). Preis und Berechtigung bestimmt nur der Server; weicht der angezeigte Preis ab, wird nicht angemeldet, sondern neu angezeigt.
- Rechnung → sofort bestätigt, Zahlung offen; kostenlos → bestätigt; Stripe → 30 Minuten reserviert (wird erst angeboten, wenn Stripe eingerichtet ist – Phase 6). Volles Event oder wartende Personen → Warteliste.
- Keine Doppelanmeldung pro E-Mail und Event; eine bestehende Person wird wiederverwendet, ihre Daten aber nicht durch ungeprüfte Eingaben überschrieben.
- Bestätigung direkt auf der Seite statt Weiterleitung auf die Teilnehmerliste (K2).
- DSGVO: AGB- und Datenschutz-Fassung werden mit Zeitpunkt gespeichert (D2); Foto/Video und Newsletter als eigene, freiwillige Häkchen (D3); Seiten für Datenschutzerklärung, AGB je Event und Impressum; Entwurf einer Datenschutzerklärung als Vorlage (D1, Text vor Go-live prüfen lassen). Wurden AGB/Datenschutz zwischenzeitlich geändert, muss neu geladen werden.
- Spamschutz: unsichtbares Honeypot-Feld und Begrenzung pro IP (10 Anmeldungen bzw. 40 Preisabfragen in 10 Minuten), ohne Captcha und ohne Speicherung.
- Admin-Eventübersicht: Hinweis, warum die öffentliche Anmeldung noch nicht möglich ist (AGB, Datenschutz, Zahlungsart), und Link zur öffentlichen Seite.
- 13 neue Tests (110 gesamt), Smoke-Test erweitert, im Browser (DE/EN) durchgespielt.

## 27.09.2026 – Phase 4e: Protokoll (D8)

- Neue Seite „Protokoll“ im Admin-Bereich: alle Audit-Einträge, neueste zuerst, 50 pro Seite.
- Filter nach Event, Bereich, Admin (inkl. System) und Zeitraum in Wiener Kalendertagen; Suche in Beschreibung, Aktion und Datensatz-ID (% und _ werden wörtlich gesucht). Filter stehen in der URL und lassen sich teilen oder als Lesezeichen speichern.
- Aktionen und Bereiche übersetzt (DE/EN), gelöschte Admins bleiben als solche erkennbar.
- Fehlermeldungen nach Aktionen heißen jetzt allgemein „Aktion fehlgeschlagen“ (auch beim Löschen passend).
- TODO D8 erledigt; 6 neue Tests (97 gesamt), Smoke-Test erweitert, im Browser (DE/EN) geprüft.

## 27.09.2026 – Phase 4d: Sponsoren

- Sponsorpakete pro Event: zweisprachiger Name, Leistungen (eine pro Zeile), Bruttopreis, USt-Satz, Reihenfolge; Löschen nur, solange kein Sponsor das Paket gebucht hat.
- Sponsoren mit Paket, Rabatt (Betrag = Paketpreis − Rabatt), Fälligkeit, Zahlungsstatus (offen/verrechnet/bezahlt/überfällig, vorerst manuell), Rechnungsadresse, Notizen und 1–10 Ansprechpersonen; Summen gesamt/bezahlt/offen.
- Ansprechpersonen sind Personen (per E-Mail wiederverwendet); vorhandene Firma/Telefon werden nicht mehr durch leere Angaben überschrieben.
- Sponsoren mit Zahlungen oder Rechnungen können nicht gelöscht werden (Aufbewahrungspflicht); Fehler für das ganze Formular erscheinen als verständliche Meldung.
- Reine Datumsangaben werden lokalisiert angezeigt (31.03.2027 / 31 Mar 2027).
- 10 neue Tests (91 gesamt); im Browser durchgespielt (DE/EN).

## 27.09.2026 – Phase 4c: Speaker und Programm

- Speaker pro Event: Person wird über die E-Mail wiederverwendet, Status für Einreichung und Folien, Anzahl zugeordneter Programmpunkte; Entfernen behält die Person.
- Programmpunkte mit zweisprachigem Titel, Raum, Art, Stream 1–4 und Speaker; Zeiten müssen im Eventzeitraum liegen, im selben Stream dürfen sich Programmpunkte nicht überschneiden.
- Programmansicht nach Tagen und Zeitfenstern; Druckansicht als normale React-Seite (Kopfzeile/Navigation beim Drucken ausgeblendet) – ersetzt die alte Druckfunktion mit `document.write` (K3).
- Gemeinsamer Personen-Service für Teilnehmende und Speaker; wiederverwendbarer Bestätigungsdialog.
- Demodaten: Summit beginnt um 08:00 (passend zum Programm).
- 7 neue Tests (81 gesamt).

## 27.09.2026 – Phase 4b: Mitgliederliste

- Upload als CSV (Semikolon oder Komma, UTF-8 oder Windows-1252) oder Excel (.xlsx); Spalten werden an deutschen oder englischen Überschriften erkannt (Pflicht: Mitgliedsnummer, Nachname; optional Vorname, E-Mail, gültig bis).
- Zwei Schritte: Vorschau mit Fehlern je Zeile (fehlende Werte, doppelte Nummern, ungültige Daten/E-Mails) und Änderungen (neu/geändert/entfällt/unverändert) → Übernehmen ersetzt die Liste vollständig; Importprotokoll und Audit-Eintrag.
- Anmeldungen mit Mitgliedspreis werden nach dem Ersetzen über die eingegebene Nummer neu verknüpft.
- Prüffunktion für die öffentliche Anmeldung: Mitgliedsnummer und Nachname müssen passen, „gültig bis“ wird beachtet.
- Mitgliederseite mit Suche; 10 neue Tests (74 gesamt).

## 27.09.2026 – Phase 4a: Teilnehmerverwaltung

- Teilnehmerliste pro Event: Suche, Filter nach Rollen (alle müssen zutreffen) und Status (einer muss zutreffen), Badge-Klick filtert, mit Strg/Cmd Mehrfachauswahl, Sortierung nach Name und Anmeldedatum, Zähler „x von y“ (Spezifikation 2.3).
- Anmeldung durch Admins: bestehende Person (E-Mail) wird wiederverwendet, keine Doppelanmeldung, Kapazitätsprüfung mit bewusster Überbuchung, Preis aus dem Event vorbelegt (Normal/Mitglied), Preis 0 = kostenlos.
- Bearbeiten (Stammdaten, Rollen, Sprache, Rechnungsangaben; Preis nach Zahlung gesperrt), Stornieren mit Pflicht-Grund statt Löschen, Bestätigen von der Warteliste.
- Excel-Export (exceljs) genau der gefilterten Zeilen, Spalten in der gewählten Sprache; jeder Export wird im Audit-Log vermerkt – ohne Suchbegriff, da dieser Namen enthalten kann.
- 15 neue Tests (64 gesamt); im Browser durchgespielt.

## 27.09.2026 – Phase 3: Events & Einstellungen

- Mehrere Events: Liste (mit Belegung, Warteliste, Anmeldestatus), Anlegen, Bearbeiten, Kopieren als Vorlage (Einstellungen, Stornobedingungen, AGB, Sponsorpakete), Archivieren (schreibgeschützt) und Wiederherstellen; Event-Umschalter in der Kopfzeile.
- Event-Einstellungen: zweisprachiger Name und Beschreibung, Kurzname für Links, Termine in Wiener Ortszeit, Anmeldezeitraum, Kapazität, Normal- und Mitgliederpreis, USt-Satz, Zahlungsarten (Stripe/Rechnung), Stornostaffel und Erstattungsmodus (automatisch/mit Freigabe).
- Versionierte AGB pro Event und globale Datenschutzerklärung (neue Version statt Überschreiben).
- Veranstalterdaten für Rechnungen und USt-Modus (Kleinunternehmer mit Hinweistext; regulär vorbereitet).
- Service-Schicht mit Audit-Eintrag in derselben Transaktion; Server Actions mit Rechteprüfung, Validierung (Zod, Browser und Server) und einheitlichen Fehlercodes.
- Übersicht zeigt kommende Events mit Belegung aus der Datenbank.
- Tests: 28 neue (Zeitumrechnung inkl. Sommerzeit, Formularprüfung, Events, Rechtstexte, Veranstalter) – insgesamt 49; im Browser auf Deutsch und Englisch durchgespielt.

## 27.09.2026 – Phase 2: Anmeldung & Rechte

- Better Auth 1.7 mit SQLite: Admin-Login per E-Mail und Passwort (mind. 12 Zeichen), keine Selbstregistrierung.
- Zwei-Faktor-Anmeldung (Authenticator-App) für Admins verpflichtend: Einrichtung mit QR-Code und Backup-Codes, Anmeldung mit Code oder Backup-Code.
- Rechteprüfung auf dem Server in jedem Admin-Layout; Vorprüfung per Sitzungs-Cookie in `proxy.ts`; Abmelden.
- `npm run admin:create` legt Admins an bzw. setzt Passwörter zurück (Audit-Log-Eintrag).
- Tests: 7 neue Tests für Konten, Anmeldung, gesperrte Registrierung und den kompletten 2FA-Ablauf; Smoke-Test um Login-Seiten erweitert; Ablauf im Browser durchgespielt (DE/EN).
- Behoben: Build öffnete die Datenbank beim Vorrendern (Reihenfolge Header/Anmeldung, `requestDb()`).

## 27.09.2026 – Phase 1: Fundament

- Firebase, Genkit, Data Connect und Cloud Functions entfernt; alte Seiten als Portierungsvorlage in `legacy/`.
- Next.js 16, React 19, Tailwind CSS 4, Zod 4, ESLint 9; Build-Fehler werden nicht mehr ignoriert.
- Mehrsprachigkeit Deutsch (Standard) und Englisch mit next-intl, Routen `/de/…` und `/en/…`.
- SQLite-Datenschicht (better-sqlite3 + Drizzle): vollständiges Schema (24 Tabellen), automatische Migrationen mit Sicherung vorher, Standardrollen.
- Tests mit Vitest (Migrationen, Schema-Regeln, Geldbeträge, Sprach-Fallback), Smoke-Test des Produktions-Builds, `/api/health`.
- Skripte: `seed:demo` (Demodaten inkl. Dummy-Mitgliedern), `db:backup`, `db:generate`, `db:studio`.

## 26.09.2026 – Start der Migration auf Next.js + SQLite

- Stand vor der Migration als Tag `firebase-final` gesichert; Arbeit auf Branch `migration/sqlite`.
- Spezifikation erweitert: DSGVO (Abschnitt 7), mehrere Events, Deutsch/Englisch, Anmelde- und Zahlungsstatus, Mitgliedsprüfung gegen Mitgliederliste, Zahlung per Stripe oder Rechnung, Kapazität und Warteliste, Storno und Erstattung, Rechnungen und USt-Vorbereitung.
- Neue Dokumente: `MIGRATIONSPLAN.md`, `TODO.md`; `DEPLOYMENT.md` neu geschrieben (lokal, später EU-VPS ohne Docker).
- Aufgeräumt: doppelte Spezifikationen (`SPECIFICATION.md`, `SPECIFICATION2.md`) und drei Changelogs zu diesem `CHANGELOG.md` zusammengeführt; `.env.example` und Node-Version (24 LTS) ergänzt.

---

## 26.07.2024 (Firebase-Version)

### Funktionserweiterungen

1.  **Öffentliche Registrierungsseite:**
    *   Eine neue, öffentliche Registrierungsseite wurde unter `/register` erstellt, damit sich Teilnehmer selbst anmelden können.
    *   Das Formular enthält Felder für Vorname, Nachname, E-Mail, Firma (optional), PMI-Mitgliedsnummer (optional) und Rechnungsadresse (optional).
    *   Die Seite zeigt den Veranstaltungsnamen und die Ticketpreise an.
    *   Ein Abschnitt für die "Allgemeinen Geschäftsbedingungen" (AGB) wurde hinzugefügt, dem die Benutzer zur Registrierung zustimmen müssen.
    *   Eine standardmäßig aktivierte Option "Rechnung per E-Mail senden" wurde hinzugefügt.

2.  **Bearbeitbare Veranstaltungsdetails:**
    *   Auf der "Event"-Seite können die AGB nun bearbeitet und gespeichert werden.
    *   Die auf der Event-Seite vorgenommenen Änderungen werden jetzt auf der öffentlichen Registrierungsseite angezeigt (mithilfe von `localStorage` als temporäre Lösung).

3.  **Verbesserte Teilnehmer-Ansicht:**
    *   Die Tabelle wurde umstrukturiert, um Name, Firma, E-Mail und PMI-Nummer in separaten, sortierbaren Spalten anzuzeigen.
    *   Eine neue Spalte "Gezahlter Betrag" wurde hinzugefügt, die den Preis aus den Rechnungsdaten anzeigt.
    *   Die Standard-Sortierreihenfolge wurde auf "Registrierungsdatum (absteigend)" geändert, um die neuesten Teilnehmer zuerst anzuzeigen.

4.  **Rechnungsdruck:**
    *   Eine Checkbox-Auswahl wurde zur Teilnehmer-Tabelle hinzugefügt.
    *   Ein Button "Rechnungen drucken" erscheint, wenn mindestens ein Teilnehmer ausgewählt ist, um eine druckfreundliche Ansicht der Rechnungen zu generieren.

5.  **Dokumentations-Downloads:**
    *   Eine neue "Downloads"-Seite wurde erstellt, um den Zugriff auf Projektdokumentationsdateien zu ermöglichen.
    *   Ein Link zu dieser Seite wurde der Hauptnavigation hinzugefügt.

### Strategische & Technische Entscheidungen

1.  **Aufschub der permanenten Dokumentenspeicherung:**
    *   Die Implementierung der permanenten Speicherung von Sprecher-Dokumenten (z.B. Präsentationen) über einen Dienst wie Firebase Storage wird vorerst zurückgestellt.
    *   **Grund:** Um unvorhergesehene Kosten im Zusammenhang mit der Datenspeicherung und dem Datenverkehr zu vermeiden. Die Funktionalität wird für eine zukünftige Version in Betracht gezogen, wenn die Nutzungsmetriken besser eingeschätzt werden können.

### Fehlerbehebungen (Bugfixes)

1.  **Fehler bei der Formular-Initialisierung behoben:** Ein Fehler ("uncontrolled to controlled input") im Formular zum Hinzufügen/Bearbeiten von Teilnehmern wurde korrigiert.
2.  **Laufzeitfehler behoben:** Ein Initialisierungsfehler ("can't access lexical declaration before initialization") auf der Teilnehmer-Seite wurde behoben.
3.  **Speichern von Event-Details korrigiert:** Ein Fehler wurde behoben, bei dem Änderungen auf der "Event"-Seite nicht gespeichert und auf anderen Seiten nicht angezeigt wurden.

### Technische Verbesserungen & Dokumentation

1.  **Datenmodell-Update:** Das Datenmodell für `Attendee` und `EventDetails` wurde erweitert, um neue Felder wie `billingAddress` und `termsOfService` zu unterstützen.
2.  **`README.md` aktualisiert:** Das `README.md` wurde um eine detaillierte technische Architekturbeschreibung und eine Erläuterung zur Anpassung des Frontends erweitert.
3.  **`HOMELAB_DEPLOYMENT.md` aktualisiert:** Die Bereitstellungsanleitung für Home-Labs wurde an die spezifische Infrastruktur des Benutzers (TrueNAS + Ubuntu VM) angepasst.

## 27.07.2024 (Firebase-Version)

### Iterative Entwicklung der Stream-Visualisierung

1.  **Implementierung & Verfeinerung der Farbcodierung:**
    *   Mehrere Versuche wurden unternommen, die Streams auf der "Schedule"-Seite farblich zu kennzeichnen, zunächst mit farbigen Balken, dann mit farbigen Punkten.
    *   Während dieses Prozesses wurden mehrere kritische Fehler im Frontend behoben:
        *   **Behebung von "Maximum update depth exceeded"**: Ein Fehler, der durch eine unendliche Render-Schleife in React verursacht wurde, wurde durch die korrekte Verwendung des `useMemo`-Hooks behoben, um die unnötige Neuerstellung von Formular-Standardwerten zu verhindern.
        *   **Behebung von "Encountered two children with the same key"**: Ein Fehler durch doppelte Schlüssel wurde korrigiert, indem die lokale Zustandsverwaltung vereinfacht und inkonsistente Daten-Updates verhindert wurden.
        *   Die Logik wurde korrigiert, um sicherzustellen, dass neu erstellte Sessions sofort die korrekte (oder keine) Farbcodierung anzeigen (optimistisches UI-Update).

2.  **Finale Entscheidung: Entfernung der Farbcodierung:**
    *   Nach mehreren Iterationen wurde entschieden, **alle farblichen Kennzeichnungen** für die Streams sowohl aus der Live-Ansicht als auch aus dem Drucklayout vollständig zu entfernen.
    *   **Grund:** Um das Design zu vereinfachen und die durch die dynamische Farbgebung verursachte Komplexität und Fehleranfälligkeit zu reduzieren. Die Benutzeroberfläche ist nun wieder in einem sauberen, neutralen Zustand ohne stream-spezifische Farben.

## 29.12.2025 (Firebase-Version)

### Dokumentation & Fehlerbehebung

1.  **Erweiterung der Spezifikation:**
    *   Das Dokument `SPECIFICATION.md` wurde um einen detaillierten Abschnitt `5. UI/UX Specification` erweitert.
    *   Dieser neue Abschnitt dokumentiert das verwendete UI-Framework (ShadCN UI, Tailwind CSS), die Icon-Bibliothek (Lucide React) und die exakte Farbpalette des Light Themes, inklusive Hex-Codes für eine einfache Reproduzierbarkeit.

2.  **Iterative Fehlerbehebung (Fortsetzung):**
    *   Die Arbeiten an der Stream-Visualisierung von letzter Woche wurden wieder aufgenommen und abgeschlossen.
    *   Ein Fehler wurde behoben, bei dem neu erstellte Sessions nicht sofort die korrekte Farbcodierung (farbige Punkte) anzeigten.
    *   Ein kritischer React-Laufzeitfehler (`Maximum update depth exceeded`), der durch eine Endlos-Schleife beim Rendern verursacht wurde, wurde durch die korrekte Memoization von Formular-Standardwerten behoben.
    *   Ein weiterer React-Fehler (`Encountered two children with the same key`), der durch inkonsistente Zustands-Updates verursacht wurde, wurde durch eine Vereinfachung der State-Management-Logik gelöst.

3.  **Finale Entscheidung zur Visualisierung (erneut):**
    *   Nach der Behebung der technischen Probleme wurde auf Wunsch des Benutzers erneut entschieden, **alle farblichen Kennzeichnungen** für die Streams vollständig zu entfernen, um das Design endgültig zu vereinfachen. Dies betrifft sowohl die Live-Ansicht als auch die Druckversion.
