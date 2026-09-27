/**
 * ENTWURF einer Datenschutzerklärung nach Art. 13 DSGVO (Spezifikation 7.1), als Ausgangspunkt für den
 * Veranstalter. Platzhalter in [ECKIGEN KLAMMERN] ersetzen. Keine Rechtsberatung – vor dem Go-live prüfen lassen.
 * Format: Leerzeile trennt Absätze, „# “ am Zeilenanfang ist eine Überschrift.
 */
import type { LocalizedText } from '@/lib/localized';

const de = `ENTWURF – vor Veröffentlichung prüfen und Platzhalter ersetzen.

# 1. Verantwortlicher
[Name des Veranstalters]
[Anschrift]
E-Mail: [Kontakt-E-Mail]

# 2. Welche Daten wir verarbeiten
Bei der Anmeldung zu einer Veranstaltung: Vor- und Nachname, E-Mail-Adresse, optional Firma, optional Mitgliedsnummer, bei Kauf auf Rechnung Rechnungsfirma und Rechnungsadresse, Zahlungs- und Rechnungsdaten, Ihre Zustimmungen samt Zeitpunkt sowie – bei Speakern und Sponsor-Kontakten – Funktion und Telefonnummer.

# 3. Zwecke und Rechtsgrundlagen
- Abwicklung der Anmeldung, Teilnahme, Zahlung und Stornierung: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
- Prüfung des Mitgliedspreises anhand der Mitgliederliste: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO).
- Rechnungslegung und Aufbewahrung der Buchhaltungsunterlagen: rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO, § 132 BAO).
- Verwendung von Foto- und Videoaufnahmen für Werbezwecke sowie Newsletter: nur mit Ihrer Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden.
- Sicherheit und Nachvollziehbarkeit von Änderungen (Protokoll ohne personenbezogene Beschreibungen): berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO).

# 4. Empfänger und Auftragsverarbeiter
- Hosting: [Hoster, Sitz in der EU/im EWR]
- E-Mail-Versand: [E-Mail-Anbieter]
- Online-Zahlung: Stripe Payments Europe Ltd., Irland (nur bei Zahlung per Stripe). Eine Übermittlung in die USA an verbundene Unternehmen von Stripe kann stattfinden; Grundlage ist [z. B. EU-US Data Privacy Framework / Standardvertragsklauseln].
Mit allen Auftragsverarbeitern bestehen Verträge nach Art. 28 DSGVO. Andere Teilnehmende sehen Ihre Daten nicht.

# 5. Speicherdauer
- Rechnungs- und Zahlungsdaten: 7 Jahre ab Ende des Kalenderjahres (§ 132 BAO).
- Übrige Anmeldedaten: bis spätestens 6 Monate nach der Veranstaltung, danach gelöscht oder anonymisiert.
- Stornierte Anmeldungen und Wartelisteneinträge ohne Zahlung: 30 Tage nach der Veranstaltung.
- Protokolleinträge: 2 Jahre. Sicherungskopien: höchstens 90 Tage.
- Einwilligungen (Foto, Newsletter): bis zum Widerruf.

# 6. Cookies
Wir verwenden nur technisch notwendige Cookies (z. B. die gewählte Sprache und die Sitzung im Verwaltungsbereich), keine Analyse- oder Tracking-Dienste.

# 7. Ihre Rechte
Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie auf Widerruf erteilter Einwilligungen. Wenden Sie sich dazu an [Kontakt-E-Mail].
Sie können sich außerdem bei der Österreichischen Datenschutzbehörde beschweren (Barichgasse 40–42, 1030 Wien, www.dsb.gv.at).`;

const en = `DRAFT – review and replace the placeholders before publishing.

# 1. Controller
[Organizer name]
[Address]
Email: [contact email]

# 2. Data we process
When you register for an event: first and last name, email address, optionally company, optionally member number, for invoice payment the billing company and billing address, payment and invoice data, your consents including timestamp and – for speakers and sponsor contacts – role and phone number.

# 3. Purposes and legal bases
- Handling registration, participation, payment and cancellation: performance of a contract (Art. 6(1)(b) GDPR).
- Checking eligibility for the member price against the member list: performance of a contract (Art. 6(1)(b) GDPR).
- Invoicing and keeping accounting records: legal obligation (Art. 6(1)(c) GDPR, § 132 Austrian Federal Fiscal Code).
- Use of photos and videos for promotional purposes and newsletters: only with your consent (Art. 6(1)(a) GDPR). Consent is voluntary and can be withdrawn at any time with effect for the future.
- Security and traceability of changes (log without personal descriptions): legitimate interest (Art. 6(1)(f) GDPR).

# 4. Recipients and processors
- Hosting: [host, located in the EU/EEA]
- Email delivery: [email provider]
- Online payment: Stripe Payments Europe Ltd., Ireland (only when paying via Stripe). Data may be transferred to Stripe affiliates in the USA; the legal basis is [e.g. EU-US Data Privacy Framework / standard contractual clauses].
Data processing agreements under Art. 28 GDPR are in place with all processors. Other attendees never see your data.

# 5. Retention
- Invoice and payment data: 7 years from the end of the calendar year (§ 132 BAO).
- Other registration data: no later than 6 months after the event, then deleted or anonymised.
- Cancelled registrations and waitlist entries without payment: 30 days after the event.
- Log entries: 2 years. Backups: at most 90 days.
- Consents (photo, newsletter): until withdrawn.

# 6. Cookies
We only use technically necessary cookies (e.g. your chosen language and the session in the admin area) and no analytics or tracking services.

# 7. Your rights
You have the right of access, rectification, erasure, restriction of processing, data portability and objection, and to withdraw consent. Please contact [contact email].
You may also lodge a complaint with the Austrian Data Protection Authority (Barichgasse 40–42, 1030 Vienna, www.dsb.gv.at).`;

export const PRIVACY_NOTICE_DRAFT: LocalizedText = { de, en };
