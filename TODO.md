# EventFlow – To-do

Stand: 26.09.2026. Grundlage: Prüfbericht vom 26.09.2026 (Commit `e33f365`).
Hinweis: Die Architektur wird von Firebase weg umgestellt. Punkte, die sich dadurch erledigen oder anders lösen, sind markiert.

## Kritisch – vor jedem Einsatz mit echten Daten

- [ ] **K1 – Admin-Authentifizierung einführen.** Derzeit wird jeder Besucher anonym angemeldet und hat vollen Zugriff auf alle Daten; „Admin Login“ ist nur ein Link, „Logout“ ohne Funktion.
  Ziel: Login für Admins (Passwort + optional 2FA), Rollen admin / attendee / public, alle Admin-Seiten serverseitig geschützt.
- [ ] **K2 – Weiterleitung nach der Registrierung korrigieren.** Nach dem Absenden landet der Teilnehmer auf `/attendees` (komplette Teilnehmerliste).
  Ziel: eigene Danke-Seite, bzw. Weiterleitung zu Stripe Checkout.
- [ ] **K3 – XSS in den Druckansichten beheben.** `invoice-view.tsx` und `print-schedule.tsx` schreiben Name, E-Mail, Firma und Session-Daten ungefiltert per `document.write`.
  Ziel: Druckansichten als normale React-Seite rendern oder alle Werte escapen; Tailwind-CDN-Script entfernen.
- [ ] **K4 – Registrierung erst nach Zahlung bestätigen, Preis serverseitig.** Derzeit sofort „Confirmed“, Preis im Browser berechnet, jede PMI-Nummer gibt Rabatt.
  Ziel: Status „Reserved“ → Stripe Checkout → Webhook setzt „Confirmed“ (bzw. Kauf auf Rechnung, Spec 3.1); Preis und Mitgliedsprüfung gegen die Mitgliederliste nur auf dem Server.
- [ ] **K5 – Build-Fehler nicht mehr ignorieren.** `ignoreBuildErrors` und `ignoreDuringBuilds` in `next.config.ts` entfernen; Typ- und Lint-Fehler beheben (bekannt: `padding="checkbox"` auf TableHead/TableCell).
- [ ] **K6 – Zugriffsregeln nachvollziehbar im Repo.** `firestore.rules` ist in `firebase.json` nicht eingebunden.
  *Mit dem Firebase-Ausstieg:* entfällt als Firestore-Thema; ersetzt durch Rechteprüfung in jeder Server Action / Route (siehe K1) plus Tests dafür.

## DSGVO (siehe Spezifikation, Abschnitt 7)

- [ ] **D1 – Datenschutzerklärung** erstellen, versionieren und auf Registrierungsseite, im Portal und in allen E-Mails verlinken (7.1).
- [ ] **D2 – Zustimmungen protokollieren.** AGB- und Datenschutz-Version samt Zeitpunkt je Registrierung speichern (7.3).
- [ ] **D3 – Foto-/Video-Einwilligung aus den AGB herauslösen** (derzeit AGB-Punkt 7) und als eigene, freiwillige Opt-in-Checkbox umsetzen; ebenso Newsletter (7.3).
- [ ] **D4 – Auskunft/Export vervollständigen.** Sponsor-Kontakte werden nie gefunden (Abfrage vergleicht ganzes Kontaktobjekt), Speaker fehlen, Suche ist case-sensitiv, Datum wird als Objekt exportiert (7.4).
- [ ] **D5 – Löschung vs. Aufbewahrungspflicht.** Anonymisierung überschreibt derzeit auch Rechnungsdaten. Rechnungs-/Zahlungsdaten 7 Jahre aufbewahren (§ 132 BAO), stattdessen Verarbeitung einschränken (7.4, 7.5).
- [ ] **D6 – Automatisches Löschkonzept** mit den Fristen aus 7.5 umsetzen (geplanter Job mit Protokoll); Backup-Rotation festlegen.
- [ ] **D7 – Anfragen von Betroffenen protokollieren** (Art, Eingang, Erledigung, Admin; Frist 1 Monat) (7.4).
- [ ] **D8 – Audit-Log** für Änderungen und für jeden Export personenbezogener Daten (6.2, 7.6).
- [ ] **D9 – Hosting in der EU**, Auftragsverarbeitungsverträge (Hosting, E-Mail, ggf. Zahlungsanbieter), Verzeichnis von Verarbeitungstätigkeiten, Ablauf für Datenpannen (72 h) dokumentieren (7.7).

## Rechtliches außerhalb der DSGVO

- [ ] **R1 – Rechnungen nach § 11 UStG:** fortlaufende Rechnungsnummer (serverseitig vergeben), Name/Anschrift und UID des Veranstalters, Leistungsdatum, Netto/Steuersatz/Steuerbetrag, Kleinunternehmer-Hinweis falls zutreffend. Platzhalter „EventFlow Inc.“, „Tech Conference 2024“, „$99.00“ und fixes „Paid“ entfernen.
