# Product

<!-- impeccable:product-schema 1 -->

> Erstellt am 18.11.2026 mit `/impeccable init` aus Repository (README, specification.md, TODO.md, Seeds) und früheren
> Gesprächen. Die Interviewfragen wurden nicht beantwortet; Punkte mit **[abgeleitet]** sind Vermutungen aus dem Repo,
> **[offen]** ist bewusst unentschieden. Bitte bei Gelegenheit bestätigen oder korrigieren.

## Platform

web

## Users

- **Event-Manager im Admin-Bereich** (laut Spezifikation rund 5 Personen): verwalten mehrere Events eines
  Veranstalters – Anmeldungen, Rechnungen und Mahnungen, Speaker, Programm, Sponsoren, Event anlegen und
  veröffentlichen, Nachbereitung, Finanzen (Erfolgsrechnung). Häufigste Handgriffe in der Teilnehmerliste: filtern,
  einzeln bearbeiten, Massenbearbeitung, händische Anmeldung.
- **Helfer am Eventtag:** Check-in bestätigter Anmeldungen mit Suche, Zähler, Einchecken und Rückgängig.
  Gerät am Einlass **[offen]** (Laptop, Tablet oder Handy).
- **Teilnehmende:** sehen die öffentliche Eventseite, melden sich an (de/en), zahlen per Stripe oder auf Rechnung,
  verwalten ihre Anmeldung im Portal per Magic-Link (Stammdaten, Storno). Sehen nie Daten anderer.
- **Speaker und Sponsoren:** als Personen bzw. Kontakte im System; eigene Oberflächen für sie **[offen]**.
- Ob die Admins ehrenamtlich nebenbei oder hauptberuflich arbeiten: **[offen]**.

## Product Purpose

EventFlow ist die Eventverwaltung eines Veranstalters: mehrere Events mit öffentlicher Anmeldung, Mitgliederpreis,
Zahlung per Stripe oder Rechnung, Warteliste, Storno und Erstattung, Speaker, Sponsoren, Programm und Check-in –
zweisprachig und DSGVO-konform. Erfolg heißt: Die Orga erledigt die wiederkehrenden Abläufe eines Events schnell und
fehlerfrei („es muss flutschen“), Teilnehmende kommen ohne Hürden von der Eventseite zur bestätigten Anmeldung, und
Rechnungen, Erstattungen und Datenschutz halten rechtlich.

## Positioning

Zugeschnitten auf einen österreichischen Mitgliederverband statt auf generische Ticketing-Plattformen:
Mitgliederpreis nur gegen die eigene Mitgliederliste, Rechnungen nach § 11 UStG mit lückenlosem Nummernkreis und
Kleinunternehmer-Hinweis, Aufbewahrung nach § 132 BAO, Löschkonzept nach DSGVO/DSG, selbst gehostet in der EU ohne
Abhängigkeit von einer SaaS-Plattform.

Erster und bisher einziger bekannter Veranstalter: PMI Austria (Seeds: Forum Day 2026, Herbstforum) **[abgeleitet]**.
Ob EventFlow später auch anderen Veranstaltern angeboten wird (Funktionsprospekt und Hosting-Unterlagen liegen im
Repo): **[offen]**.

## Operating Context

- Abläufe über das Eventjahr: Event anlegen (oft als Kopie des Vorjahres) → veröffentlichen → Anmeldungen und
  Zahlungen betreuen → Programm und Speaker planen → Sponsoren betreuen → Check-in am Eventtag → Nachbereitung,
  Erfolgsrechnung, Archivierung (archivierte Events sind schreibgeschützt).
- Admin-Bereich mit Eventumschalter; Organisation (Admins, Mitgliederliste, Veranstalterdaten) ist global.
- Öffentliche Eventseite mit Rückblick-Modus nach Eventende; daneben existiert eine externe Website des Veranstalters.
- Admin-Login mit Pflicht-2FA. Alle Änderungen und Exporte personenbezogener Daten landen im Audit-Log.
- Exporte als Excel (.xlsx), Rechnungen und Gutschriften als PDF, Programm als Druckansicht.
- Betrieb: selbst gehostet (EU-VPS oder Docker hinter nginx eines Sysadmins), SQLite-Datenbank.

## Capabilities and Constraints

- **Stack (bestehend):** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS 4, ShadCN UI
  (Radix), next-intl, SQLite mit Drizzle, Vitest.
- **Sprachen:** Deutsch (Standard) und Englisch; mehrsprachige Inhalte als `{ de, en? }`, UI-Texte in
  `messages/*.json`.
- **Geld** immer in Cent, Steuersätze in Basispunkten; **Zeiten** in UTC speichern, in Europe/Vienna anzeigen.
- **Status-Begriffe:** Anmeldung `Reserved` / `Confirmed` / `Waitlisted` / `Cancelled`; Zahlung `Open` / `Paid` /
  `Partially refunded` / `Refunded` / `Not required`; Zahlungsart `Stripe` / `Invoice` / `Free`; Rollen Attendee,
  Speaker, Organizer, Sponsor.
- Preis und Mitgliedschaft entscheidet nur der Server; Anmeldungen werden nie gelöscht, nur storniert;
  Personendaten werden anonymisiert statt gelöscht, solange Belege aufbewahrt werden müssen.
- Mahnungen auch für stornierte Anmeldungen sind gewollt (offene Stornogebühr). Programm-Überschneidungen im selben
  Stream lehnt der Server ab.
- **UI-Umbau läuft:** neue Oberfläche auf Branch `ui-neu`, alte Varianten bleiben per Umschalter (Cookie
  `eventflow-ui`) erreichbar, bis ausdrücklich entfernt (TODO UI6). Keine Funktion darf beim Umbau verloren gehen;
  alle Tests müssen grün bleiben.
- Prozessorientierte Hilfe ist geplant (TODO UI5).

## Brand Commitments

- Produktname: **EventFlow**.
- Events haben eigenes Logo und eigene Website (Felder in der Datenbank); öffentliche Seiten tragen das Logo des
  jeweiligen Events.
- Ob die öffentlichen Seiten an das Erscheinungsbild des Veranstalters gebunden sind: **[offen]**.
- Die frühen Stilvorgaben in `docs/blueprint.md` (Lila, Hellgrau, Inter) stammen aus dem Firebase-Prototyp und sind
  nicht als verbindlich bestätigt.

## Evidence on Hand

- Demodaten per `npm run seed:demo`, realistische Eventinhalte per `seed:forumday` und `seed:herbstforum`
  (Programm, Speaker mit Bios). Keine echten Personendaten im Repository.
- Unterlagen: `EventFlow-Funktionsprospekt.pdf`, `EventFlow-Hosting-Admin.pdf`, `specification.md`,
  `docs/umsetzungsplan-feedback-2026-11.md`, klickbares Admin-Mockup in `docs/entwurf/`.
- Keine Kundenstimmen, Kennzahlen oder Referenzen außerhalb dieses einen Veranstalters – nichts davon erfinden.

## Product Principles

1. **Abläufe vor Seiten:** Die Oberfläche folgt den Hauptprozessen der Orga (anmelden, abrechnen, planen,
   einchecken, nachbereiten), nicht der Datenbankstruktur.
2. **Es muss flutschen:** häufige Handgriffe mit wenig Klicks, Massenbearbeitung wo es Arbeit spart, klare Zustände
   und sofortige Rückmeldung.
3. **Rechtlich belastbar ohne Zutun:** Rechnungen, Erstattungen, Aufbewahrung und Datenschutz sind im System
   abgesichert; die Oberfläche macht Folgen (Storno, Erstattung, Löschung) vor dem Bestätigen sichtbar.
4. **Nichts geht verloren:** stornieren statt löschen, Protokoll für jede Änderung, Umbauten ohne Funktionsverlust.
5. **Zweisprachig von Anfang an:** jede Oberfläche und jeder öffentliche Text funktioniert auf Deutsch und Englisch.

## Accessibility & Inclusion

Verbindlicher Standard (z. B. WCAG 2.1 AA für die öffentlichen Seiten) **[offen]**. Öffentliche Anmeldung und Portal
richten sich an ein breites Fachpublikum auf Desktop und Handy.
