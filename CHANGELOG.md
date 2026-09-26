# Changelog

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
