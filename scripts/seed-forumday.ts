/**
 * Legt den PMI Austria Forum Day 2026 samt Masterclass mit den Inhalten der bisherigen Eventseite an
 * (Quelle: https://insights.squer.io/pmi-austria-forum-day-2026?eventId=382, Stand 15.11.2026, Agenda 2026).
 *
 * Aufruf:  npm run seed:forumday            (bricht ab, wenn die Events schon vorhanden sind)
 *          npm run seed:forumday -- --reset (entfernt die beiden Events samt Programm, Speakern, Sponsoren und legt sie neu an;
 *                                            nur solange es keine Anmeldungen und keine Ausgaben dazu gibt)
 *
 * Alles läuft über die echten Services (Event anlegen inkl. AGB-Kopie und Kostengruppen, Streams, Speaker mit Rolle und
 * Kurzbio, Programm mit Co-Speakern, Sponsoren, Sonderpreise, Motto und Nutzen-Blöcke der Eventseite). Bilder (Titelbild,
 * Galerie, Speaker-Fotos, Sponsor-Logos) lädt das Team im Admin unter „Eventseite“, „Speaker“ und „Sponsoren“ hoch. Keine Anmeldungen, keine E-Mails. Vor jedem Lauf wird die Datenbank nach BACKUP_DIR gesichert.
 * Speaker-Adressen sind Platzhalter auf @forumday-seed.example.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import { loadEnv } from './lib/env';
import { backupDatabase } from '../src/server/db/backup';
import { backupDirFromEnv, databasePathFromEnv, openDatabase } from '../src/server/db/core';
import * as s from '../src/server/db/schema';
import type { Actor } from '../src/server/services/audit';
import { createEvent } from '../src/server/services/events';
import { createPriceCategory } from '../src/server/services/pricing';
import { addStream, createSession, createSpeaker, renameStream } from '../src/server/services/program';
import { createPackage, createSponsor } from '../src/server/services/sponsors';
import { addGalleryImages, saveEventPage, setSpeakerPhoto, setSponsorLogo } from '../src/server/services/event-page';
import type { SessionInput } from '../src/lib/validation/program';
import { removeMediaImage, type MediaUpload } from '../src/server/media/storage';

const SOURCE = 'https://insights.squer.io/pmi-austria-forum-day-2026?eventId=382';
const DOMAIN = 'forumday-seed.example';
const FORUM_SLUG = 'forum-day-2026';
const MASTERCLASS_SLUG = 'forum-day-2026-masterclass';
const LOCATION = 'Hochschule für Wirtschaft & Gesellschaft des BFI Wien, Wohlmutstraße 22, 1020 Wien';

loadEnv();
const reset = process.argv.includes('--reset');
const dbPath = databasePathFromEnv();
const db = openDatabase({ path: dbPath, backupDir: backupDirFromEnv() });
const admin = db.select().from(s.authUsers).where(eq(s.authUsers.role, 'admin')).orderBy(s.authUsers.createdAt).get();
const actor: Actor = { userId: admin?.id ?? null };

function fail(message: string): never {
  console.error(`Abbruch: ${message}`);
  db.$client.close();
  process.exit(1);
}

/** Wiener Ortszeit im November (MEZ, +01:00) → UTC */
const at = (day: '02' | '03', hhmm: string) => new Date(`2026-11-${day}T${hhmm}:00+01:00`).toISOString();

// ---------------------------------------------------------------------------
// Vorhandene Events entfernen (--reset)
// ---------------------------------------------------------------------------

function existingEvents() {
  return db
    .select()
    .from(s.events)
    .where(inArray(s.events.slug, [FORUM_SLUG, MASTERCLASS_SLUG]))
    .all();
}

function removeEvents(ids: number[]) {
  const regs = db.select({ id: s.registrations.id }).from(s.registrations).where(inArray(s.registrations.eventId, ids)).all();
  if (regs.length) fail(`Zu den Events gibt es schon ${regs.length} Anmeldung(en) – bitte im Admin bearbeiten statt neu anlegen.`);
  const exps = db.select({ id: s.expenses.id }).from(s.expenses).where(inArray(s.expenses.eventId, ids)).all();
  if (exps.length) fail(`Zu den Events gibt es schon ${exps.length} Ausgabe(n) – bitte im Admin bearbeiten statt neu anlegen.`);
  const speakerPeople = db
    .select({ id: s.people.id })
    .from(s.people)
    .where(inArray(s.people.id, db.select({ id: s.speakers.personId }).from(s.speakers).where(inArray(s.speakers.eventId, ids))))
    .all()
    .map((p) => p.id);
  const media = [
    ...db.select({ p: s.events.heroImagePath }).from(s.events).where(inArray(s.events.id, ids)).all(),
    ...db.select({ p: s.events.logoPath }).from(s.events).where(inArray(s.events.id, ids)).all(),
    ...db
      .select({ h: s.events.highlights })
      .from(s.events)
      .where(inArray(s.events.id, ids))
      .all()
      .flatMap((r) => r.h.map((x) => ({ p: x.iconPath ?? null }))),
    ...db.select({ p: s.eventGalleryImages.imagePath }).from(s.eventGalleryImages).where(inArray(s.eventGalleryImages.eventId, ids)).all(),
    ...db.select({ p: s.speakers.photoPath }).from(s.speakers).where(inArray(s.speakers.eventId, ids)).all(),
    ...db.select({ p: s.sponsors.logoPath }).from(s.sponsors).where(inArray(s.sponsors.eventId, ids)).all(),
  ].map((r) => r.p);
  if (media.some(Boolean)) {
    console.warn(`Hinweis: ${media.filter(Boolean).length} hochgeladene Bild(er) (Titelbild, Galerie, Fotos, Logos) gehen mit --reset verloren.`);
  }
  db.transaction((tx) => {
    tx.delete(s.sponsors).where(inArray(s.sponsors.eventId, ids)).run();
    tx.delete(s.eventCostGroups).where(inArray(s.eventCostGroups.eventId, ids)).run();
    tx.update(s.events).set({ termsDocumentId: null }).where(inArray(s.events.id, ids)).run();
    tx.delete(s.legalDocuments).where(inArray(s.legalDocuments.eventId, ids)).run();
    tx.delete(s.events).where(inArray(s.events.id, ids)).run();
    // Platzhalter-Personen der Speaker (nur die mit Seed-Adresse und ohne andere Verwendung)
    for (const id of speakerPeople) {
      const p = tx.select().from(s.people).where(eq(s.people.id, id)).get();
      const used = tx.select({ id: s.speakers.id }).from(s.speakers).where(eq(s.speakers.personId, id)).get();
      if (p?.email?.endsWith(`@${DOMAIN}`) && !used) tx.delete(s.people).where(eq(s.people.id, id)).run();
    }
  });
  for (const p of media) removeMediaImage(p);
}

// ---------------------------------------------------------------------------
// Inhalte der Eventseite 2026
// ---------------------------------------------------------------------------

type SpeakerDef = { first: string; last: string; company: string | null; role?: string; bio?: string };
const SPEAKERS = {
  walch: {
    first: 'Kathleen',
    last: 'Walch',
    company: 'PMI',
    role: 'Director of AI Engagement and Community',
    bio: 'Kathleen Walch leads AI engagement and community at PMI. She co-developed the CPMAI methodology for AI projects, co-hosts the "AI Today" podcast and is a sought-after voice on agentic AI.',
  },
  easton: {
    first: 'Stuart',
    last: 'Easton',
    company: 'TransparentChoice',
    role: 'CEO & Co-Founder',
    bio: 'Stuart Easton is CEO and co-founder of TransparentChoice. He helps PMOs and portfolio teams make better prioritisation decisions and turn projects into measurable benefits.',
  },
  schachl: {
    first: 'Andreas',
    last: 'Schachl',
    company: 'Responsible Annotation Services GmbH',
    role: 'Co-Founder',
    bio: 'Andreas Schachl co-founded an AI data-annotation venture with a social mission and brings many years of experience leading and mentoring software teams.',
  },
  hantsch: {
    first: 'Maximilian',
    last: 'Hantsch',
    company: 'Frequentis AG',
    bio: 'Maximilian Hantsch works in software development and communication networks at Frequentis and leads both classic and agile teams.',
  },
  dehais: {
    first: 'Joachim',
    last: 'Dehais',
    company: 'Swiss Federal Archives · PMI Switzerland',
    role: 'Enterprise Architect',
    bio: 'Joachim Dehais is an enterprise architect in the Swiss federal administration, teaches project management at the University of Bern and was named best speaker at the PMI Leadership Institute 2025.',
  },
  vetrano: {
    first: 'Lorenzo',
    last: 'Vetrano',
    company: 'Alten Switzerland AG · PMI Southern Italy',
    role: 'Agile Coach',
    bio: 'Lorenzo Vetrano is an international agile coach and former competitive basketball player who brings team dynamics from the court into project work.',
  },
  guettel: {
    first: 'Wolfgang H.',
    last: 'Güttel',
    company: 'TU Wien',
    role: 'Professor of Leadership and Strategy',
    bio: 'Wolfgang H. Güttel is full professor of leadership and strategy at TU Wien. Before academia he worked in industry and consulting.',
  },
  hendling: {
    first: 'Daniel',
    last: 'Hendling',
    company: 'HENDLING',
    role: 'Project Management Consultant',
    bio: 'Daniel Hendling is an independent project management consultant in Austria, certified in PMP, IPMA and PRINCE2, and contributes to international PM standards (ISO/TC 258).',
  },
  lassance: {
    first: 'Denis',
    last: 'Lassance',
    company: 'PMI',
    role: 'Managing Director, PMI Europe Region',
    bio: 'Denis Lassance heads the PMI Europe region and has more than 20 years of experience leading projects and transformations, previously in the pharmaceutical industry.',
  },
  rabl: {
    first: 'Wolfgang',
    last: 'Rabl',
    company: 'next level consulting',
    role: 'Managing Director',
    bio: 'Wolfgang Rabl is managing director and owner of next level consulting and has advised organisations on projects, processes and change for 30 years.',
  },
  engelhardt: {
    first: 'Mark',
    last: 'Engelhardt',
    company: 'PPPM Consulting',
    bio: 'Mark Engelhardt has worked in project management for more than 30 years and is co-founder and long-standing former president of the PMI Austria Chapter.',
  },
  bosin: {
    first: 'Markus',
    last: 'Bosin',
    company: 'ORF',
    role: 'Enterprise Architect',
    bio: 'Markus Bosin is enterprise architect at ORF and has more than 25 years of IT experience.',
  },
  wana: {
    first: 'Oliver',
    last: 'Wana',
    company: 'SQUER',
    role: 'Head of Strategic Advisory',
    bio: 'Oliver Wana heads strategic advisory at SQUER. He was previously CTPO at Haufe Advisory and lectures at several Viennese universities.',
  },
  pincot: {
    first: 'Lenka',
    last: 'Pincot',
    company: 'PMI',
    role: 'Chief of Staff to the CEO',
    bio: 'Lenka Pincot is Chief of Staff to the CEO at PMI. Before joining PMI she led the agile transformation of a large European bank.',
  },
  nieto: {
    first: 'Antonio',
    last: 'Nieto-Rodriguez',
    company: null,
    role: 'Author & Advisor',
    bio: 'Antonio Nieto-Rodriguez is a former PMI Chair, Thinkers50-ranked author of the HBR Project Management Handbook and is often called the father of modern project management.',
  },
  withake: { first: 'Dirk', last: 'Withake', company: 'PMI' },
} satisfies Record<string, SpeakerDef>;
type SpeakerKey = keyof typeof SPEAKERS;

const ascii = (v: string) =>
  v
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');

/** Bild aus scripts/assets/forumday (von der Originalseite geladen); fehlt es, bleibt das Feld leer. */
const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'assets', 'forumday');
let missingAssets = 0;
function asset(name: string): MediaUpload | null {
  const file = path.join(ASSETS, name);
  if (!fs.existsSync(file)) {
    missingAssets++;
    return null;
  }
  return { fileName: name, data: fs.readFileSync(file) };
}

/** Programmpunkt: Streams 1 = Festsaal, 2 = Raum 1.04, 3 = Raum 1.01; ohne stream = über alle drei */
type Item = { from: string; to: string; title: string; tag: SessionInput['tag']; speaker?: SpeakerKey; with?: SpeakerKey[]; stream?: 1 | 2 | 3 };
const ROOM = { 1: 'Festsaal', 2: 'Raum 1.04', 3: 'Raum 1.01' } as const;

const FORUM_PROGRAM: Item[] = [
  { from: '09:00', to: '09:30', title: 'Entry & Registration', tag: 'general' },
  { from: '09:30', to: '09:45', title: 'Welcome & Opening', tag: 'general' },
  { from: '09:45', to: '10:30', title: 'Keynote: AI and Lifelong Learning – Thriving in the Era of Intelligent Transformation', tag: 'talk', speaker: 'walch' },
  { from: '10:30', to: '11:00', title: 'Networking Break', tag: 'break' },
  { from: '11:00', to: '12:00', title: 'The Missing Link in PMO Success: Why Power Skills Beat Process Every Time', tag: 'talk', speaker: 'easton', stream: 1 },
  {
    from: '11:00',
    to: '12:00',
    title: 'Combining technological precision with social responsibility to make the world SAFER',
    tag: 'talk',
    speaker: 'schachl',
    with: ['hantsch'],
    stream: 2,
  },
  { from: '11:00', to: '12:00', title: 'Politics, suffer or master your destiny', tag: 'talk', speaker: 'dehais', stream: 3 },
  { from: '12:00', to: '13:00', title: 'Lunch Break', tag: 'break' },
  { from: '13:00', to: '14:00', title: 'Unlocking Team Performance through Movement', tag: 'workshop', speaker: 'vetrano', with: ['dehais'], stream: 1 },
  { from: '13:00', to: '14:00', title: 'The Triple Loop of Change-Model', tag: 'talk', speaker: 'guettel', stream: 2 },
  { from: '13:00', to: '14:00', title: 'All Buttons Pushed: Needs-Focused Leadership with the MOVE Model', tag: 'talk', speaker: 'hendling', stream: 3 },
  { from: '14:00', to: '14:30', title: 'Networking Break', tag: 'break' },
  {
    from: '14:30',
    to: '15:30',
    title: 'Fireside Talk: The Project Professional of Tomorrow – Skills, Careers and the Future of the Profession',
    tag: 'talk',
    speaker: 'lassance',
    with: ['rabl', 'engelhardt'],
    stream: 1,
  },
  { from: '14:30', to: '15:30', title: 'Host Leadership: Creating the Conditions for Teams to Thrive', tag: 'talk', speaker: 'vetrano', stream: 2 },
  { from: '14:30', to: '15:30', title: 'The Human Side of AI-Native IT', tag: 'talk', speaker: 'bosin', with: ['wana'], stream: 3 },
  { from: '15:30', to: '16:00', title: 'Networking Break', tag: 'break' },
  { from: '16:00', to: '16:45', title: 'Keynote: Power-Up with M.O.R.E', tag: 'talk', speaker: 'pincot' },
  {
    from: '16:45',
    to: '17:30',
    title: 'Keynote: The Project-Driven Organization – Eight Building Blocks, and the Power Skills That Make Them Work',
    tag: 'talk',
    speaker: 'nieto',
  },
  { from: '17:30', to: '17:45', title: 'Closing Remarks', tag: 'general', speaker: 'withake' },
  { from: '17:45', to: '19:30', title: 'Evening Reception – Networking with drinks and snacks', tag: 'general' },
];

/** Sponsoren mit Website und Logo-Datei in scripts/assets/forumday */
const SPONSORS = [
  { name: 'Frequentis', website: 'https://www.frequentis.com/at', logo: 'sponsor-frequentis.png' },
  { name: 'BOTFORCE', website: 'https://www.botforce-technology.com/', logo: 'sponsor-botforce.png' },
  { name: 'SQUER', website: 'https://www.squer.io/', logo: 'sponsor-squer.png' },
  { name: 'Next Level Consulting', website: 'https://www.nextlevelconsulting.com/', logo: 'sponsor-next-level-consulting.png' },
  { name: 'Planisware', website: 'https://de.planisware.com/', logo: 'sponsor-planisware.png' },
  { name: 'BFI Wien', website: 'https://www.fh-vie.ac.at/', logo: 'sponsor-bfi-wien.png' },
  { name: 'Dynact', website: 'https://www.dynact.at/', logo: 'sponsor-dynact.png' },
  { name: 'Hendling', website: 'https://www.hendling.com/de', logo: 'sponsor-hendling.png' },
  { name: 'Global Peter Drucker Forum', website: 'https://www.druckerforum.org/', logo: 'sponsor-drucker-forum.png' },
];

/** Farben wie auf der Originalseite (PMI-Violett, dunkles Violett, blaue Buttons, Creme) */
const THEME = { primary: '#4F17A8', dark: '#271053', accent: '#1EAEE9', surface: '#F6F4EF' };
const GALLERY = Array.from({ length: 10 }, (_, i) => `gallery-${String(i + 1).padStart(2, '0')}.jpg`);

const FORUM_DESCRIPTION = {
  de: [
    'Zwei Tage Lernen, Leadership und Wirkung: In einer von KI geprägten Welt bleibt zwischenmenschliche Exzellenz der entscheidende Unterschied. Am ersten Tag vertieft die Masterclass ein Thema in kleiner Runde, am zweiten Tag bietet der Forum Day Keynotes, Case Studies und Diskussionen in drei parallelen Streams.',
    '',
    'Neu in diesem Jahr: Der Forum Day endet mit einem Abendempfang. Jedes Ticket enthält den Zugang für den ganzen Tag und 6 zertifizierte PDUs.',
  ].join('\n'),
  en: [
    'A two-day experience of learning, leadership and impact: in an AI-driven world, interpersonal excellence remains the ultimate differentiator. Day one is the masterclass in a small group, day two the Forum Day with keynotes, case studies and discussions in three parallel streams.',
    '',
    'New this year: the Forum Day now includes an evening reception. Every ticket includes full-day access and 6 certified PDUs.',
  ].join('\n'),
};

const MASTERCLASS_DESCRIPTION = {
  de: 'Masterclass #1 mit Stuart Easton (TransparentChoice): „Beyond Delivery: How PMOs Drive Benefits and Strategic Value“. Vier Stunden in kleiner Runde inklusive Networking-Kaffeepause, am Vortag des PMI Austria Forum Day 2026. Das Ticket enthält 4 zertifizierte PDUs.',
  en: 'Master Class #1 with Stuart Easton (TransparentChoice): "Beyond Delivery: How PMOs Drive Benefits and Strategic Value". Four hours in a small group including a networking coffee break, the day before the PMI Austria Forum Day 2026. Your ticket includes 4 certified PDUs.',
};

// ---------------------------------------------------------------------------
// Anlegen
// ---------------------------------------------------------------------------

const existing = existingEvents();
if (existing.length && !reset) fail(`Events schon vorhanden (${existing.map((e) => e.slug).join(', ')}). Neu anlegen mit --reset.`);

const backup = backupDatabase(db.$client, backupDirFromEnv(), 'vor-seed-forumday');
console.log(`Sicherung: ${backup}`);
if (existing.length) {
  removeEvents(existing.map((e) => e.id));
  console.log(`Entfernt: ${existing.map((e) => e.slug).join(', ')}`);
}

const common = {
  location: LOCATION,
  registrationOpensAt: new Date('2026-06-01T00:00:00+02:00').toISOString(),
  ticketVatRateBp: 2000,
  vatMode: null,
  allowStripe: true,
  allowInvoice: true,
  refundMode: 'approval' as const,
  cancellationRules: [],
};

const masterclass = createEvent(db, actor, {
  ...common,
  slug: MASTERCLASS_SLUG,
  name: { de: 'PMI Austria Forum Day 2026 – Masterclass', en: 'PMI Austria Forum Day 2026 – Master Class' },
  description: MASTERCLASS_DESCRIPTION,
  startsAt: at('02', '13:00'),
  endsAt: at('02', '17:00'),
  registrationClosesAt: at('02', '09:00'),
  capacity: 25,
  priceNormalCents: 15000,
  priceMemberCents: 5000,
});

const forum = createEvent(db, actor, {
  ...common,
  slug: FORUM_SLUG,
  name: { de: 'PMI Austria Forum Day 2026', en: 'PMI Austria Forum Day 2026' },
  description: FORUM_DESCRIPTION,
  startsAt: at('03', '09:00'),
  endsAt: at('03', '19:30'),
  registrationClosesAt: at('02', '12:00'),
  capacity: 250,
  priceNormalCents: 25000,
  priceMemberCents: 7500,
});

// Eventseite: Motto, Farben, Logo, Titelbild und Nutzen-Blöcke mit Icons (Texte der Originalseite)
const TAGLINE = { de: 'Power Skills: Lead People, Win Projects', en: 'Power Skills: Lead People, Win Projects' };
saveEventPage(
  db,
  actor,
  forum.id,
  {
    tagline: TAGLINE,
    theme: THEME,
    highlights: [
      {
        title: { de: 'Evidenzbasierte Einblicke', en: 'Evidence-based insights' },
        text: { de: 'Case Studies, die zeigen, wie Projekte erfolgreich werden.', en: 'Case studies demonstrating successful project outcomes.' },
      },
      {
        title: { de: 'Übertragbare Best Practices', en: 'Transferable best practices' },
        text: { de: 'Umsetzbare Lessons Learned für Ihre eigenen Projekte.', en: 'Actionable lessons learned for your own projects.' },
      },
      {
        title: { de: 'Praxisnah und international', en: 'Practical and international' },
        text: {
          de: 'Spannende, praxisnahe Inhalte für ein internationales Publikum – 6 zertifizierte PDUs.',
          en: 'Engaging, practical content for an international audience – 6 certified PDUs.',
        },
      },
    ],
  },
  {
    hero: { upload: asset('hero.jpg'), remove: false },
    logo: { upload: asset('logo-pmi-austria.png'), remove: false },
    icons: [asset('icon-1.png'), asset('icon-2.png'), asset('icon-3.png')],
  }
);
saveEventPage(
  db,
  actor,
  masterclass.id,
  {
    tagline: TAGLINE,
    theme: THEME,
    highlights: [
      {
        title: { de: 'Kleine Runde', en: 'Small group' },
        text: { de: 'Vier Stunden intensiv mit Stuart Easton.', en: 'Four intensive hours with Stuart Easton.' },
      },
      {
        title: { de: 'Nutzen statt Lieferung', en: 'Benefits over delivery' },
        text: { de: 'Wie PMOs strategischen Wert schaffen.', en: 'How PMOs create strategic value.' },
      },
      { title: { de: '4 PDUs', en: '4 PDUs' }, text: { de: 'Zertifizierte PDUs inklusive.', en: 'Certified PDUs included.' } },
    ],
  },
  {
    hero: { upload: asset('gallery-03.jpg'), remove: false },
    logo: { upload: asset('logo-pmi-austria.png'), remove: false },
    icons: [asset('icon-2.png'), asset('icon-1.png'), asset('icon-3.png')],
  }
);
const galleryUploads = GALLERY.map(asset).filter((u): u is MediaUpload => u !== null);
if (galleryUploads.length) addGalleryImages(db, actor, forum.id, galleryUploads);

// Sonderpreise (nur im Admin auswählbar): Studierende wie Mitglieder, Gruppenpreise je Person
createPriceCategory(db, actor, masterclass.id, { name: 'Studierende', priceCents: 5000, active: true });
createPriceCategory(db, actor, forum.id, { name: 'Studierende', priceCents: 7500, active: true });
createPriceCategory(db, actor, forum.id, { name: 'Group Deal (10 Personen, 2.200 € gesamt)', priceCents: 22000, active: true });
createPriceCategory(db, actor, forum.id, { name: 'Group Deal Large (15 Personen, 3.200 € gesamt)', priceCents: 21333, active: true });

// Streams
renameStream(db, actor, forum.id, 1, { de: ROOM[1], en: 'Festsaal' });
addStream(db, actor, forum.id, { de: ROOM[2], en: 'Room 1.04' });
addStream(db, actor, forum.id, { de: ROOM[3], en: 'Room 1.01' });
renameStream(db, actor, masterclass.id, 1, { de: 'Raum 2.18', en: 'Room 2.18' });

// Speaker (bestätigt, damit sie öffentlich erscheinen)
function addSpeaker(eventId: number, key: SpeakerKey): number {
  const d: SpeakerDef = SPEAKERS[key];
  return createSpeaker(db, actor, eventId, {
    firstName: d.first,
    lastName: d.last,
    email: `${ascii(d.first)}.${ascii(d.last)}@${DOMAIN}`,
    company: d.company,
    locale: 'en',
    proposalStatus: 'confirmed',
    slidesStatus: 'missing',
    slidesUrl: null,
    role: d.role ?? null,
    bio: d.bio ? { de: d.bio, en: d.bio } : null,
  });
}
const forumSpeaker = Object.fromEntries((Object.keys(SPEAKERS) as SpeakerKey[]).map((k) => [k, addSpeaker(forum.id, k)])) as Record<SpeakerKey, number>;
const eastonMc = addSpeaker(masterclass.id, 'easton');

// Fotos (Dateien speaker-<key>.png/.jpg; Dirk Withake hat keins)
const PHOTO_NAME: Partial<Record<SpeakerKey, string>> = { nieto: 'nieto-rodriguez' };
function photoOf(key: SpeakerKey): MediaUpload | null {
  const base = `speaker-${PHOTO_NAME[key] ?? key}`;
  const name = ['png', 'jpg'].map((ext) => `${base}.${ext}`).find((n) => fs.existsSync(path.join(ASSETS, n)));
  return name ? asset(name) : null;
}
for (const key of Object.keys(SPEAKERS) as SpeakerKey[]) {
  const photo = photoOf(key);
  if (photo) setSpeakerPhoto(db, actor, forumSpeaker[key], photo);
}
const eastonPhoto = photoOf('easton');
if (eastonPhoto) setSpeakerPhoto(db, actor, eastonMc, eastonPhoto);

// Programm (Co-Speaker als weitere Speaker des Programmpunkts)
for (const it of FORUM_PROGRAM) {
  createSession(db, actor, forum.id, {
    title: { de: it.title },
    startsAt: at('03', it.from),
    endsAt: at('03', it.to),
    location: it.stream ? '' : it.tag === 'break' ? 'Foyer' : ROOM[1],
    tag: it.tag,
    stream: it.stream ?? 1,
    streamTo: it.stream ?? 3,
    speakerId: it.speaker ? forumSpeaker[it.speaker] : null,
    coSpeakerIds: it.with?.map((k) => forumSpeaker[k]) ?? [],
  });
}
createSession(db, actor, masterclass.id, {
  title: { de: 'Master Class #1: Beyond Delivery – How PMOs Drive Benefits and Strategic Value' },
  startsAt: at('02', '13:00'),
  endsAt: at('02', '17:00'),
  location: 'Raum 2.18',
  tag: 'workshop',
  stream: 1,
  speakerId: eastonMc,
});

// Sponsoren (Beträge unbekannt → Paket „Partner“ ohne Preis)
const partner = createPackage(db, actor, forum.id, {
  name: { de: 'Partner', en: 'Partners' },
  benefits: { de: [], en: [] },
  priceCents: 0,
  vatRateBp: 2000,
  sortOrder: 1,
});
for (const sp of SPONSORS) {
  const sponsorId = createSponsor(db, actor, forum.id, {
    companyName: sp.name,
    website: sp.website,
    packageId: partner,
    discountCents: 0,
    dueOn: null,
    paymentStatus: 'paid',
    billingAddress: '',
    vatId: null,
    notes: `Übernommen von ${SOURCE}`,
    contacts: [],
  });
  const logo = asset(sp.logo);
  if (logo) setSponsorLogo(db, actor, sponsorId, logo);
}

db.insert(s.auditLog)
  .values({ action: 'seed', entity: 'database', summary: `Forum Day 2026 und Masterclass angelegt (Quelle ${SOURCE})` })
  .run();
if (missingAssets) console.warn(`Hinweis: ${missingAssets} Bild(er) fehlen in ${ASSETS} – diese Felder bleiben leer.`);
console.log(
  `Angelegt in ${dbPath}: /events/${FORUM_SLUG} (${FORUM_PROGRAM.length} Programmpunkte, ${Object.keys(SPEAKERS).length} Speaker, ${SPONSORS.length} Sponsoren) und /events/${MASTERCLASS_SLUG}`
);
db.$client.close();
