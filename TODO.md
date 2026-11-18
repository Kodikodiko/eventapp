# EventFlow – To-do

Stand: 26.09.2026. Grundlage: Prüfbericht vom 26.09.2026 (Commit `e33f365`).
Hinweis: Die Architektur wurde von Firebase auf Next.js + SQLite umgestellt (abgeschlossen); Punkte, die sich dadurch erledigt haben, sind markiert.

## Kritisch – vor jedem Einsatz mit echten Daten

- [x] **K1 – Admin-Authentifizierung einführen.** *(erledigt in Phase 2: Better Auth, Admin-Login mit Pflicht-2FA, Rollenprüfung serverseitig in jedem Admin-Layout, Vorprüfung in proxy.ts, keine anonymen Sitzungen mehr)* Derzeit wird jeder Besucher anonym angemeldet und hat vollen Zugriff auf alle Daten; „Admin Login“ ist nur ein Link, „Logout“ ohne Funktion.
  Ziel: Login für Admins (Passwort + optional 2FA), Rollen admin / attendee / public, alle Admin-Seiten serverseitig geschützt.
- [x] **K2 – Weiterleitung nach der Registrierung korrigieren.** Nach dem Absenden landet der Teilnehmer auf `/attendees` (komplette Teilnehmerliste).
  Ziel: eigene Danke-Seite, bzw. Weiterleitung zu Stripe Checkout.
- [x] **K3 – XSS in den Druckansichten beheben.** *(erledigt in Phase 4c: Programm-Druck als React-Seite; die alte Rechnungs-Druckfunktion ist entfallen, Rechnungen kommen in Phase 7 als PDF)* `invoice-view.tsx` und `print-schedule.tsx` schreiben Name, E-Mail, Firma und Session-Daten ungefiltert per `document.write`.
  Ziel: Druckansichten als normale React-Seite rendern oder alle Werte escapen; Tailwind-CDN-Script entfernen.
- [x] **K4 – Registrierung erst nach Zahlung bestätigen, Preis serverseitig.** Derzeit sofort „Confirmed“, Preis im Browser berechnet, jede PMI-Nummer gibt Rabatt. *Stand Phase 6: Preis und Mitgliedschaft serverseitig (Phase 5), Online-Zahlung bestätigt erst über Webhook; mit simulierter Kasse getestet – Test mit echtem Stripe-Testschlüssel steht noch aus.*
  Ziel: Status „Reserved“ → Stripe Checkout → Webhook setzt „Confirmed“ (bzw. Kauf auf Rechnung, Spec 3.1); Preis und Mitgliedsprüfung gegen die Mitgliederliste nur auf dem Server.
- [x] **K5 – Build-Fehler nicht mehr ignorieren.** *(erledigt in Phase 1: Flags entfernt, Typecheck/Lint/Build grün; die betroffenen alten Seiten wurden neu geschrieben, die Vorlagen sind entfernt)* `ignoreBuildErrors` und `ignoreDuringBuilds` in `next.config.ts` entfernen; Typ- und Lint-Fehler beheben (bekannt: `padding="checkbox"` auf TableHead/TableCell).
- [x] **K6 – Zugriffsregeln nachvollziehbar im Repo.** *(erledigt: Firestore entfernt; Rechteprüfung serverseitig in `src/server/auth/session.ts` – `requireAdmin`/`requireAdminWith2fa` für Seiten, `assertAdmin` für Aktionen – mit Tests)* `firestore.rules` ist in `firebase.json` nicht eingebunden.
  *Mit dem Firebase-Ausstieg:* entfällt als Firestore-Thema; ersetzt durch Rechteprüfung in jeder Server Action / Route (siehe K1) plus Tests dafür.

## DSGVO (siehe Spezifikation, Abschnitt 7)

- [ ] **D1 – Datenschutzerklärung** erstellen, versionieren und auf Registrierungsseite, im Portal und in allen E-Mails verlinken (7.1). *Stand Phase 5: Entwurf als Vorlage, versionierte Seite /privacy, auf Event- und Anmeldeseite verlinkt; in allen E-Mails (Phase 7) und im Teilnehmerportal (Phase 9) verlinkt; Text vor Go-live prüfen lassen.*
- [x] **D2 – Zustimmungen protokollieren.** AGB- und Datenschutz-Version samt Zeitpunkt je Registrierung speichern (7.3).
- [x] **D3 – Foto-/Video-Einwilligung aus den AGB herauslösen** (derzeit AGB-Punkt 7) und als eigene, freiwillige Opt-in-Checkbox umsetzen; ebenso Newsletter (7.3). *Newsletter am 14.11.2026 komplett entfernt (Migration 0014 löscht gespeicherte Einwilligungen).*
- [x] **D4 – Auskunft/Export vervollständigen.** Sponsor-Kontakte werden nie gefunden (Abfrage vergleicht ganzes Kontaktobjekt), Speaker fehlen, Suche ist case-sensitiv, Datum wird als Objekt exportiert (7.4). *Erledigt 14.11.2026: Admin → Datenschutz, Suche nach E-Mail (ohne Groß-/Kleinschreibung), Name oder Firma; Auskunft als JSON und Excel mit Anmeldungen, Speaker, Sponsor-Kontakten, Einwilligungen, Zahlungen, Belegen, Anfragen und Protokoll; Datumsangaben als ISO-Text; jeder Export im Audit-Log.*
- [x] **D5 – Löschung vs. Aufbewahrungspflicht.** Anonymisierung überschreibt derzeit auch Rechnungsdaten. Rechnungs-/Zahlungsdaten 7 Jahre aufbewahren (§ 132 BAO), stattdessen Verarbeitung einschränken (7.4, 7.5). *Erledigt 14.11.2026: Löschen = Anonymisieren; Rechnungen/Gutschriften bleiben mit Empfänger-Snapshot bis `retain_until`, Anmeldungen und Zahlungen ohne Personenbezug; Person bleibt zusätzlich eingeschränkt (keine Mails, kein Portal, nicht in Exporten). Löschen gesperrt bei laufender Anmeldung oder offener Erstattung.*
- [x] **D6 – Automatisches Löschkonzept** mit den Fristen aus 7.5 umsetzen (geplanter Job mit Protokoll); Backup-Rotation festlegen. *Erledigt 14.11.2026: `npm run retention [-- --dry-run]`, läuft außerdem einmal am Tag mit `npm run jobs`; Fristen siehe Seite Datenschutz (30 Tage unbezahlte Stornos, 6 Monate nach letztem Event, 7 Jahre Belege, 2 Jahre Protokoll, 90 Tage Sicherungen, auch in `db:backup`). Speaker und Sponsor-Kontakte als Geschäftskontakte 3 Jahre nach ihrem letzten Event (Entscheidung offen, Konstante `RETENTION.businessContactYears`).*
- [x] **D7 – Anfragen von Betroffenen protokollieren** (Art, Eingang, Erledigung, Admin; Frist 1 Monat) (7.4). *Erledigt 14.11.2026: Anfragen mit Art, Eingang, Frist (1 Monat), Notiz, Erledigt-am und Admin; überfällige rot markiert.*
- [x] **D8 – Audit-Log** für Änderungen und für jeden Export personenbezogener Daten (6.2, 7.6).
- [ ] **D9 – Hosting in der EU**, Auftragsverarbeitungsverträge (Hosting, E-Mail, ggf. Zahlungsanbieter), Verzeichnis von Verarbeitungstätigkeiten, Ablauf für Datenpannen (72 h) dokumentieren (7.7).

## Rechtliches außerhalb der DSGVO

- [x] **R1 – Rechnungen nach § 11 UStG:** *(erledigt in Phase 7: Nummernkreis je Jahr ohne Lücken, Rechnung/Gutschrift als PDF de/en mit allen Pflichtangaben, Kleinunternehmer-Hinweis bzw. Netto/USt je Satz, Empfänger- und Veranstalterdaten als unveränderliche Momentaufnahme, Aufbewahrung bis 31.12. + 7 Jahre)* fortlaufende Rechnungsnummer (serverseitig vergeben), Name/Anschrift und UID des Veranstalters, Leistungsdatum, Netto/Steuersatz/Steuerbetrag, Kleinunternehmer-Hinweis falls zutreffend. Platzhalter „EventFlow Inc.“, „Tech Conference 2024“, „$99.00“ und fixes „Paid“ entfernen.

## Finanzen

- [x] **F1 – Erfolgsrechnung je Event** (13.11.2026). Event → Erfolgsrechnung: Übersicht (momentaner Erfolg = Ist, Verlauf, Anmeldungen im Vergleich, offene Posten) und Tabelle (Ist/Offen/Prognose je Tickettyp, Sponsor und Kostengruppe bis zum Einzelposten; Plan in drei Varianten und Vergleich mit bis zu zwei Events zuschaltbar), Excel-Export und Druck. Details: `CHANGELOG.md`.

## Feedback-Runde nach dem Test (13.11.2026)

Umsetzungsplan: `docs/umsetzungsplan-feedback-2026-11.md`. Umsetzung erst nach Freigabe.

- [x] **U1 – Anmeldung pausieren.** Schalter „Anmeldung pausiert“ je Event, zusätzlich zu „Anmeldung öffnet/schließt am“; stoppt sofort, die Anmeldeseite zeigt „Anmeldung derzeit pausiert“. Begonnene Reservierungen und Zahlungen laufen zu Ende.
- [x] **U2 – USt-Modus global mit Abweichung je Event.** Kleinunternehmer/regulär bleibt in den globalen Einstellungen der Standard, Vorgabe Kleinunternehmer (0 %, keine USt); je Event „wie global“ oder abweichend. Rechnungen nehmen den Wert des Events.
- [x] **U3 – Globale AGB.** AGB versioniert in den globalen Einstellungen als Vorlage: Ein neues Event übernimmt beim Anlegen eine Kopie der dann gültigen Fassung; spätere Änderungen der globalen AGB wirken nicht auf bestehende Events. Bearbeitet werden die AGB eines Events in den Event-Einstellungen („Aktuelle globale AGB als Vorlage laden“ möglich).
- [x] **U4 – Favicon** = PMI-Austria-Bildmarke ohne Text (favicon.ico, icon.png, apple-icon.png).
- [x] **U5 – Teilnahmebestätigung (Zertifikat).** Einrichtung je Event: Hintergrundbild (A4 quer) hochladen, bearbeitbarer Text mit Platzhaltern für Eventname, Datum/Uhrzeit, Ort, Teilnehmername und Bestätigungstext (de/en). In der Teilnehmerliste eine oder mehrere Personen auswählen → ein PDF (eine Seite je Person) zum Drucken/Herunterladen.
- [x] **U6 – Rechnungen: Filter „Bezahlt“** neben Alle / Offen / Überfällig.
- [x] **U7 – Erfolgsrechnung: nur die große Zahl.** Die Zeilen „€ … eingegangen, € … bezahlt“ und „Prognose …“ unter dem momentanen Erfolg entfallen.
- [x] **U8 – Sponsor ohne Paket mit Betrag.** Ohne Paket erscheinen die Felder Betrag (netto) und USt-Satz; Rechnung und Erfolgsrechnung verwenden diesen Betrag.
- [x] **U9 – Programm: bis zu 10 Streams, Punkte über mehrere Streams.** Streams je Event mit Namen (z. B. „Saal A“), 1–10. Ein Programmpunkt belegt einen Stream oder einen Bereich „von Stream – bis Stream“ (z. B. Keynote über alle) und wird in Planung, Druck und öffentlichem Programm über die ganze Breite gezeigt. Art bleibt die Werteliste Allgemein / Vortrag / Workshop / Pause.
- [x] **U10 – Speaker-Folien als Link.** Feld „Link zu den Folien“ (SharePoint oder Nextcloud, beliebige https-Adresse), Status weiter von Hand. Schalter je Event „Folien veröffentlichen“ zeigt die Links im öffentlichen Programm und im Teilnehmerportal.
- [x] **U11 – Teilnehmende: Gruppenzeile klarer.** Statt „38 Personen · 16 bezahlt · 0 offen“ z. B. „16 Personen · 22 storniert · Summe …“; die Zahlen „bezahlt/offen“ entfallen beim Gruppieren nach Zahlungsstatus.
- [x] **U12 – Kostengruppe:** Beschriftung „Speaker-Zuordnung“ → „Ausgaben einem Speaker zuordnen“.

## Preisaktionen (14.11.2026)

Umgesetzt am 14.11.2026, Details: `CHANGELOG.md`. Neue Seite „Preise & Rabatte“ je Event unter Finanzen.

- [x] **P1 – Sonderpreise.** Das Event-Team legt je Event Kategorien mit Namen und Preis an (z. B. „Studierende 49 €“). Auswahl nur bei Anmeldungen im Admin, nicht öffentlich; „Anderer Betrag“ bleibt möglich. Rechnung zeigt den Namen der Kategorie.
- [x] **P2 – Early Bird.** Zeitraum (von–bis) und eigene Preise für Normal- und Mitgliedsticket in den Event-Einstellungen. Eventseite und Anmeldung zeigen den Early-Bird-Preis mit Stichtag; die Prüfung „Preis hat sich geändert“ greift beim Übergang.
- [x] **P3 – Flash Sales als Rabattcode.** Codes je Event manuell anlegen (fixer €-Betrag oder % vom Preis, optional gültig von–bis und maximale Einlösungen, deaktivierbar), z. B. für Aussendungen. Eingabe bei der Anmeldung; gilt nur auf den Basispreis (Normal/Mitglied), nicht auf Early Bird – ist Early Bird günstiger, gilt dieser. Rabatt als eigene Rechnungszeile.
- [x] **P4 – Auswertung.** Erfolgsrechnung (Tabelle und Excel) schlüsselt Normal-, Mitglieds- und Sondertickets nach tatsächlichem Preis auf: regulär, Early Bird, je Code, je Sonderpreis-Kategorie – mit Anzahl, Ist und Offen.
- [ ] **P5 – Offen/Ideen:** Early-Bird-Kontingent („nur die ersten 50“), mehrere Stufen (Super Early Bird), Planwerte der Erfolgsrechnung je Early Bird/Code, Rabattcodes in Mail-Aussendungen automatisch einfügen.

## Eventseite Forum Day 2026 nachbauen (15.11.2026)

Quelle: https://insights.squer.io/pmi-austria-forum-day-2026?eventId=382 (bisherige Eventseite von PMI Austria auf der SQUER-Plattform). Inhalte, Texte und Logos von PMI Austria übernehmen, Design im EventFlow-Stil (nicht 1:1 kopieren). Agenda: die Fassung 2026 (Keynotes Walch, Pincot, Nieto-Rodriguez); die zweite Tabelle auf der Seite ist ein Rest vom Vorjahr und entfällt.

- [ ] **W1 – Inhalte erfassen (scrapen).** Zwei Events: Masterclass 02.11.2026 13:00–17:00 (Stuart Easton, „Beyond Delivery: How PMOs Drive Benefits and Strategic Value“, 4 PDUs; 50 € Mitglieder/Studierende, 150 € sonst) und Forum Day 03.11.2026 09:00–19:30 inkl. Evening Reception (6 PDUs; 75 € Mitglieder/Studierende, 250 € sonst). Ort: Hochschule für Wirtschaft & Gesellschaft des BFI Wien, Wohlmutstraße 22, 1020 Wien. Programm in 3 Streams (Festsaal, 1.04, 1.01), 14 Speaker mit Kurzbio, 9 Sponsoren.
- [ ] **W2 – Als Seed/Event in EventFlow anlegen** (wie `seed-herbstforum.ts`), damit die Seite mit echten Daten befüllt ist.
- [x] **W3 – Fehlende Bausteine der Eventseite** (15.11.2026 erledigt, neue Admin-Seite „Eventseite“, Migration 0015): Kopfbereich mit Motto („Power Skills: Lead People, Win Projects“), Einleitungstext, drei Nutzen-Blöcke, Bildergalerie „Impressionen vom Vorjahr“, Speaker-Karten mit Bio, Sponsor-Logos, Abschluss-Aufruf zur Anmeldung, Hinweis auf PDUs.
- [ ] **W4 – Gruppentickets** (10 Personen 2.200 €, 15 Personen 3.200 €) – mit Sonderpreisen (P1) abbildbar oder eigener Tickettyp? Klären.

## UI-Redesign (Vorschlag vom 18.11.2026 – noch nicht übernommen)

Umgesetzt als Entwurf auf dem lokalen Branch `ui-redesign` (Commits `73e45c4`, `34015ea`), main unverändert. Plan und Befund: Claude-Doc „UI-Redesign EventFlow – Audit und Umbauplan“. Werkzeug: Impeccable, projektlokal unter `.claude/`.

- [ ] **UI1 – Admin-Sidebar neu gruppieren:** Cockpit, Anmeldung (Teilnehmende, Preise & Rabatte, Teilnahmebestätigung), Programm & Auftritt (Programm, Speaker, Sponsoren, Eventseite), Finanzen (Rechnungen, Erstattungen, Ausgaben, Erfolgsrechnung), Event-Einstellungen; darunter getrennt und einklappbar „Organisation“ nur mit Globalem. Fußlink öffnet die öffentliche Seite des gewählten Events.
- [ ] **UI2 – Öffentliche Eventseite als Vorlage:** Hero mit Faktenzeile und Status-Button, mitlaufende Abschnittsnavigation, ruhiger Farbrhythmus, Plenum-Vorträge hervorgehoben, Pausen dezent, Keynote-Speaker groß, Rückblick-Modus nach Eventende, Galerie ohne Lücken, Partner auf hellem Grund; Kontrast der Speaker-Links (2,5:1) behoben.
- [ ] **UI3 – Admin-Seiten entlang der Hauptprozesse überarbeiten** (Analyse läuft, Schwerpunkt Teilnehmerliste).
- [ ] **UI4 – Check-in am Eventtag** (neu, 18.11.2026): Einlass vom Handy oder Tablet – Suche nach Name/Firma, QR-Code auf dem Ticket scannen, als anwesend markieren, Nachmeldung vor Ort, Live-Zähler; Anwesenheit als Grundlage für die Teilnahmebestätigung.
- [ ] **UI5 – Hilfe prozessorientiert** (später): klassisch Seiten und Felder erklären, zusätzlich entlang der Hauptprozesse führen (Anmeldungen betreuen, Rechnungen und Mahnungen, Speaker, Programm, Sponsoren, Event anlegen und veröffentlichen, Nachbereitung).

## Hosting (Docker hinter nginx beim Sysadmin, Plan seit 12.11.2026 – zurückgestellt am 13.11.2026)

Details: `DEPLOYMENT.md`, Teil C.

- [ ] **H1 – Client-IP fälschungssicher.** `clientIp()` in `src/server/rate-limit.ts` nimmt den *ersten* Eintrag von `X-Forwarded-For`; hinter nginx mit `$proxy_add_x_forwarded_for` kann ein Angreifer ihn setzen und die Begrenzung von Login und Anmeldung umgehen. `X-Real-IP` bevorzugen, IP-Header von Better Auth festlegen; nginx setzt beide Header auf `$remote_addr`.
- [ ] **H2 – Dockerfile** (mehrstufig, `node:24-bookworm-slim`, `output: 'standalone'`, Benutzer ohne Root, `HEALTHCHECK` auf `/api/health` per `node -e fetch(...)`) und `.dockerignore`.
- [ ] **H3 – Skripte ohne tsx:** `jobs`, `db:backup`, `admin:create` (später `retention`) beim Build mit esbuild zu `.mjs` bündeln, damit das Laufzeit-Image ohne Entwicklungspakete auskommt.
- [ ] **H4 – `docker-compose.yml`:** Dienste `eventflow` und `eventflow-jobs` (alle 300 s `jobs.mjs`), Volume `/data`, Netz des nginx ohne `ports:`, `read_only`, `cap_drop: ALL`, `no-new-privileges`, `init: true`, Logrotation, Speicherlimit.
- [ ] **H5 – Entwickler-Schalter in Produktion sperren:** Start mit `NODE_ENV=production` bricht ab, wenn `PAYMENT_PROVIDER=fake`, `AUTO_SEED` oder `DEV_LOGIN`/`DEV_ADMIN_WITHOUT_2FA` gesetzt sind.
- [ ] **H6 – Image-Pipeline:** GitHub Actions baut bei Release-Tag und monatlich, prüft mit Trivy, schiebt nach GHCR (privat); Dependabot für npm und Basis-Image.
- [ ] **H7 – Content-Security-Policy** in der App (Nonces für Skripte).
- [ ] **H8 – Backup und Notfall:** `db-backup.mjs` per Timer, Volume ins Backup des Sysadmins (verschlüsselt, extern; DB 90 Tage, Rechnungen und Belege 7 Jahre); Wiederherstellung vor Go-live einmal durchspielen; Notfallablauf (Teil C.7) mit dem Sysadmin abstimmen.
- [ ] **H9 – Mit dem Sysadmin klären:** nginx im Container oder auf dem Host, Deploy-Weg (Registry-Pull oder eingeschränkter SSH-Zugang), Backup-System, GeoIP/CrowdSec, Monitoring, Client-Zertifikat für mTLS, Serverstandort EU und AVV (siehe D9), SMTP-Relay mit SPF/DKIM.
