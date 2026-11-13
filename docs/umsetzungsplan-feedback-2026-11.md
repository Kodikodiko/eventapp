# Umsetzungsplan Feedback-Runde (13.11.2026)

Grundlage: Feedback nach dem Test vom 13.11.2026, Punkte U1–U12 in `TODO.md`.
Umsetzung erst nach Freigabe („go“). Gearbeitet wird lokal im Projektordner, kein PR.

Die Arbeit ist in fünf Pakete geteilt. Nach jedem Paket laufen Tests, Typprüfung und Lint; danach kannst du testen, bevor das nächste Paket beginnt. Pakete mit Datenbankänderung bringen eine neue Migration mit (wird beim Start automatisch angewendet; vorher Backup mit `npm run db:backup`).

## Paket 1 – Kleinigkeiten (ohne Datenbankänderung)

| Punkt | Was | Wo |
|---|---|---|
| U4 | Bildmarke aus dem Logo ausschneiden (quadratisch, transparent), daraus `favicon.ico` (16/32/48), `icon.png` (512) und `apple-icon.png` (180) | `src/app/` |
| U6 | Filter „Bezahlt“ in der Rechnungsliste | `invoices-view.tsx`, `messages/*.json` |
| U7 | Unterzeilen unter „Momentaner Erfolg“ entfernen | `src/components/admin/pnl/` |
| U11 | Gruppenzeile: führende Zahl ohne Stornierte, Stornierte extra („· 22 storniert“, nur wenn > 0); „bezahlt/offen“ entfällt beim Gruppieren nach Zahlungsstatus | `src/lib/registration-groups.ts`, `attendees-table.tsx`, Tests |
| U12 | Beschriftung „Ausgaben einem Speaker zuordnen“ | `messages/*.json` |

Aufwand: klein.

## Paket 2 – Event-Einstellungen (Migration 0009)

**U1 Anmeldung pausieren**
- Neue Spalte `events.registration_paused` (ja/nein, Standard nein).
- Schalter in den Event-Einstellungen und als Schnellaktion im Event-Kopf („Anmeldung pausieren“ / „Anmeldung fortsetzen“), mit Eintrag im Audit-Log.
- `registrationState()` in `src/server/services/events.ts` liefert bei Pause den neuen Zustand `paused`; Eventseite und Anmeldeformular zeigen „Anmeldung derzeit pausiert“. Begonnene Reservierungen und Zahlungen laufen weiter.

**U2 USt-Modus je Event** *(bestätigt: global, Vorgabe Kleinunternehmer = 0 %)*
- Neue Spalte `events.vat_mode` (leer = wie globale Einstellung, sonst Kleinunternehmer/regulär).
- Rechnungserstellung nimmt den Wert des Events, sonst den globalen. Bereits ausgestellte Rechnungen bleiben unverändert (Momentaufnahme).

**U3 Globale AGB**
- `legal_documents` mit `kind = terms` und ohne `event_id` = globale AGB, versioniert wie die Datenschutzerklärung; Bearbeitung unter Einstellungen.
- Neue Spalte `events.terms_mode` (global/eigen). Bei „global“ gilt immer die aktuelle globale Fassung.
- Seite „AGB“ im Event: zeigt die geltende Fassung; Knopf „Für dieses Event anpassen“ (Kopie als eigene Fassung) bzw. „Zurück auf globale AGB“.
- Zustimmungen speichern weiterhin die konkrete Dokument-Version.
- Bestehende Events behalten ihre eigenen AGB (Modus „eigen“); neue Events starten mit „global“. Beim Kopieren eines Events wird der Modus übernommen.

Aufwand: mittel.

## Paket 3 – Sponsoren und Speaker-Folien (Migration 0010)

**U8 Sponsor ohne Paket**
- Neue Spalten `sponsors.amount_cents` und `sponsors.vat_rate_bp`, nur genutzt, wenn kein Paket gewählt ist.
- Formular: Felder „Betrag (netto)“ und „USt-Satz“ erscheinen nur ohne Paket; Pflicht, wenn ohne Paket.
- Rechnung, Sponsorenliste und Erfolgsrechnung verwenden den Betrag; auf der Eventseite steht der Sponsor wie bisher in der Gruppe ohne Paket.

**U10 Speaker-Folien als Link**
- Neue Spalte `speakers.slides_url` (https-Adresse, optional); Status „fehlt / hochgeladen / geprüft“ bleibt von Hand.
- Speaker-Dialog: Feld „Link zu den Folien“; in der Tabelle ein Link-Symbol zum Öffnen.
- Neue Spalte `events.slides_public` (ja/nein): zeigt die Links im öffentlichen Programm beim jeweiligen Programmpunkt und im Teilnehmerportal.
- Hinweis im Formular: Der Link muss im SharePoint bzw. in der Nextcloud für Externe freigegeben sein (Freigabelink „Jeder mit dem Link“).

Aufwand: klein bis mittel.

## Paket 4 – Programm mit bis zu 10 Streams (Migration 0011)

- Neue Tabelle `event_streams` (Event, Position 1–10, Name de/en, z. B. „Saal A“); bestehende Events bekommen „Stream 1“ bis zum höchsten verwendeten Stream.
- Streams im Event anlegen, umbenennen, Reihenfolge ändern.
- `sessions.stream` wird zu `stream_from` und neu `stream_to` (Bereich, z. B. 1–4 für eine Keynote über alle). Prüfung 1 ≤ von ≤ bis ≤ 10. Bestehende Punkte: von = bis = alter Stream.
- Formular Programmpunkt: Auswahl „Stream“ mit zusätzlicher Option „Alle Streams“ und „von … bis …“.
- Überschneidungsprüfung berücksichtigt Bereiche (eine Keynote über alle Streams blockiert jeden Stream in dieser Zeit).
- Einen Stream löschen geht nur, wenn kein Programmpunkt darin liegt (sonst Hinweis).
- Darstellung in Planungsansicht, Druckansicht und öffentlichem Programm: Spalten je Stream mit Namen als Überschrift, Punkte über mehrere Streams über die entsprechende Breite.
- Art bleibt die bestehende Werteliste (Allgemein, Vortrag, Workshop, Pause).

Aufwand: mittel bis groß (Rasterdarstellung an drei Stellen).

## Paket 5 – Teilnahmebestätigung (Migration 0012)

**Einrichtung je Event** (neuer Reiter „Teilnahmebestätigung“)
- Hintergrundbild hochladen (PNG/JPG, A4 quer, max. 5 MB), Ablage wie die Belege unter `data/`.
- Text de/en bearbeitbar, mit Platzhaltern `{name}`, `{event}`, `{datum}`, `{ort}`; Vorgabe z. B.: „{name} hat am {datum} an {event} in {ort} teilgenommen.“ Zusätzlich Überschrift (Standard „Teilnahmebestätigung“).
- Feste, zentrierte Anordnung der Texte auf dem Hintergrund; Vorschau als PDF mit Beispielnamen.

**Ausgabe**
- In der Teilnehmerliste eine oder mehrere Personen auswählen → Aktion „Teilnahmebestätigung (PDF)“: ein PDF mit einer Seite je Person, Sprache je Person nach ihrer Spracheinstellung.
- Erzeugung mit `pdfkit` (wie bei den Rechnungen), Eintrag im Audit-Log.
- Mailversand ist vorbereitet (SMTP vorhanden), aber nicht Teil dieses Pakets; kann später als Aktion „per Mail senden“ ergänzt werden.

Aufwand: mittel bis groß.

## Offen

- Nichts mehr; Umsetzung wartet auf „go“.
