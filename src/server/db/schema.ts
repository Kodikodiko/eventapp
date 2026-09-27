/**
 * Datenbankschema (Drizzle ORM, SQLite) – die einzige Quelle der Wahrheit für die Tabellen.
 *
 * Änderungen: Schema hier anpassen → `npm run db:generate` erzeugt eine neue SQL-Migration in drizzle/
 * → beim nächsten App-Start wird sie automatisch (mit Sicherung vorher) eingespielt.
 * Bestehende Migrationsdateien nie nachträglich ändern.
 *
 * Konventionen (siehe MIGRATIONSPLAN.md):
 * - Geldbeträge als ganze Cent (INTEGER, Suffix _cents), Steuersätze in Basispunkten (2000 = 20 %)
 * - Zeitstempel als ISO-8601-Text in UTC, reine Kalenderdaten als 'YYYY-MM-DD'
 * - Mehrsprachige Inhalte als JSON { de: string, en?: string }
 * - E-Mail-Adressen immer klein geschrieben gespeichert
 */
import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { LocalizedList, LocalizedText } from '@/lib/localized';

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Aktueller Zeitpunkt als ISO-8601 in UTC mit Millisekunden, z. B. 2026-09-27T08:15:00.000Z */
const NOW = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () => text('created_at').notNull().default(NOW);

export const LOCALES = ['de', 'en'] as const;
export const VAT_MODES = ['small_business', 'standard'] as const;
export const REFUND_MODES = ['automatic', 'approval'] as const;
export const LEGAL_DOCUMENT_KINDS = ['terms', 'privacy'] as const;
export const REGISTRATION_STATUSES = ['reserved', 'confirmed', 'waitlisted', 'cancelled'] as const;
export const PAYMENT_STATUSES = ['open', 'paid', 'partially_refunded', 'refunded', 'not_required'] as const;
export const PAYMENT_METHODS = ['stripe', 'invoice', 'free'] as const;
export const TICKET_TYPES = ['normal', 'member'] as const;
export const SOURCES = ['public', 'portal', 'admin'] as const;
export const CONSENT_KINDS = ['terms', 'privacy', 'photo', 'newsletter'] as const;
export const PAYMENT_RECORD_METHODS = ['stripe', 'bank_transfer'] as const;
export const PAYMENT_RECORD_STATUSES = ['pending', 'succeeded', 'failed', 'expired'] as const;
export const REFUND_STATUSES = ['proposed', 'approved', 'executed', 'rejected', 'failed'] as const;
export const INVOICE_TYPES = ['invoice', 'credit_note'] as const;
export const PROPOSAL_STATUSES = ['pending', 'confirmed', 'rejected'] as const;
export const SLIDES_STATUSES = ['missing', 'uploaded', 'review'] as const;
export const SESSION_TAGS = ['general', 'talk', 'workshop', 'break'] as const;
export const SPONSOR_PAYMENT_STATUSES = ['open', 'invoiced', 'paid', 'overdue'] as const;
export const DSR_TYPES = ['access', 'rectification', 'erasure', 'restriction'] as const;

// ---------------------------------------------------------------------------
// Einstellungen und Events
// ---------------------------------------------------------------------------

/** Veranstalterdaten für Rechnungen und USt-Modus (genau eine Zeile, id = 1). */
export const organizerSettings = sqliteTable(
  'organizer_settings',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull().default(''),
    address: text('address').notNull().default(''),
    vatId: text('vat_id'),
    iban: text('iban'),
    bic: text('bic'),
    contactEmail: text('contact_email'),
    vatMode: text('vat_mode', { enum: VAT_MODES }).notNull().default('small_business'),
    smallBusinessNote: text('small_business_note', { mode: 'json' }).$type<LocalizedText>(),
    invoicePaymentTermDays: integer('invoice_payment_term_days').notNull().default(14),
    updatedAt: text('updated_at').notNull().default(NOW),
  },
  (t) => [check('organizer_settings_single_row', sql`${t.id} = 1`)]
);

export const legalDocuments = sqliteTable(
  'legal_documents',
  {
    id: id(),
    kind: text('kind', { enum: LEGAL_DOCUMENT_KINDS }).notNull(),
    /** nur bei AGB gesetzt (AGB gelten pro Event), Datenschutzerklärung ist global */
    eventId: integer('event_id').references((): AnySQLiteColumn => events.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content: text('content', { mode: 'json' }).$type<LocalizedText>().notNull(),
    validFrom: text('valid_from').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('legal_documents_kind_event_idx').on(t.kind, t.eventId, t.version)]
);

export const events = sqliteTable(
  'events',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name', { mode: 'json' }).$type<LocalizedText>().notNull(),
    description: text('description', { mode: 'json' }).$type<LocalizedText>(),
    location: text('location').notNull().default(''),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    capacity: integer('capacity').notNull(),
    registrationOpensAt: text('registration_opens_at'),
    registrationClosesAt: text('registration_closes_at'),
    priceNormalCents: integer('price_normal_cents').notNull(),
    priceMemberCents: integer('price_member_cents').notNull(),
    ticketVatRateBp: integer('ticket_vat_rate_bp').notNull().default(2000),
    allowStripe: integer('allow_stripe', { mode: 'boolean' }).notNull().default(true),
    allowInvoice: integer('allow_invoice', { mode: 'boolean' }).notNull().default(true),
    refundMode: text('refund_mode', { enum: REFUND_MODES }).notNull().default('automatic'),
    termsDocumentId: integer('terms_document_id').references((): AnySQLiteColumn => legalDocuments.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    archivedAt: text('archived_at'),
  },
  (t) => [
    index('events_starts_at_idx').on(t.startsAt),
    check('events_capacity_nonnegative', sql`${t.capacity} >= 0`),
    check('events_prices_nonnegative', sql`${t.priceNormalCents} >= 0 AND ${t.priceMemberCents} >= 0`),
  ]
);

/** Stornobedingungen: bis `days_before_event` Tage vor Beginn → `refund_percent` % Erstattung. */
export const cancellationRules = sqliteTable(
  'cancellation_rules',
  {
    id: id(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    daysBeforeEvent: integer('days_before_event').notNull(),
    refundPercent: integer('refund_percent').notNull(),
  },
  (t) => [
    uniqueIndex('cancellation_rules_event_days_uq').on(t.eventId, t.daysBeforeEvent),
    check('cancellation_rules_percent_range', sql`${t.refundPercent} BETWEEN 0 AND 100`),
    check('cancellation_rules_days_nonnegative', sql`${t.daysBeforeEvent} >= 0`),
  ]
);

export const roles = sqliteTable('roles', {
  id: id(),
  key: text('key').notNull().unique(),
  label: text('label', { mode: 'json' }).$type<LocalizedText>().notNull(),
});

// ---------------------------------------------------------------------------
// Personen, Mitglieder, Anmeldungen
// ---------------------------------------------------------------------------

export const people = sqliteTable(
  'people',
  {
    id: id(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** klein geschrieben; NULL nach Anonymisierung */
    email: text('email').unique(),
    company: text('company'),
    phone: text('phone'),
    locale: text('locale', { enum: LOCALES }).notNull().default('de'),
    createdAt: createdAt(),
    updatedAt: text('updated_at').notNull().default(NOW),
    restrictedAt: text('restricted_at'),
    anonymizedAt: text('anonymized_at'),
  },
  (t) => [
    index('people_last_name_idx').on(t.lastName),
    check('people_email_lowercase', sql`${t.email} IS NULL OR ${t.email} = lower(${t.email})`),
  ]
);

/** Aktuelle Mitgliederliste (wird per Upload ersetzt; Abgleich über member_number). */
export const members = sqliteTable(
  'members',
  {
    id: id(),
    memberNumber: text('member_number').notNull().unique(),
    lastName: text('last_name').notNull(),
    firstName: text('first_name'),
    email: text('email'),
    validUntil: text('valid_until'),
    importedAt: text('imported_at').notNull().default(NOW),
  },
  (t) => [index('members_last_name_idx').on(t.lastName)]
);

export const memberImports = sqliteTable('member_imports', {
  id: id(),
  uploadedAt: createdAt(),
  uploadedBy: text('uploaded_by'),
  fileName: text('file_name').notNull(),
  rowCount: integer('row_count').notNull(),
  addedCount: integer('added_count').notNull(),
  updatedCount: integer('updated_count').notNull(),
  removedCount: integer('removed_count').notNull(),
});

export const registrations = sqliteTable(
  'registrations',
  {
    id: id(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    status: text('status', { enum: REGISTRATION_STATUSES }).notNull(),
    paymentStatus: text('payment_status', { enum: PAYMENT_STATUSES }).notNull(),
    paymentMethod: text('payment_method', { enum: PAYMENT_METHODS }).notNull(),
    ticketType: text('ticket_type', { enum: TICKET_TYPES }).notNull().default('normal'),
    memberId: integer('member_id').references(() => members.id, { onDelete: 'set null' }),
    memberNumberEntered: text('member_number_entered'),
    priceCents: integer('price_cents').notNull(),
    billingCompany: text('billing_company'),
    billingAddress: text('billing_address'),
    source: text('source', { enum: SOURCES }).notNull(),
    reservedUntil: text('reserved_until'),
    createdAt: createdAt(),
    confirmedAt: text('confirmed_at'),
    cancelledAt: text('cancelled_at'),
    cancelReason: text('cancel_reason'),
    checkedInAt: text('checked_in_at'),
    qrToken: text('qr_token').notNull().unique(),
  },
  (t) => [
    index('registrations_event_status_idx').on(t.eventId, t.status),
    index('registrations_person_idx').on(t.personId),
    // Eine Person kann pro Event nur eine nicht stornierte Anmeldung haben
    uniqueIndex('registrations_event_person_active_uq')
      .on(t.eventId, t.personId)
      .where(sql`status <> 'cancelled'`),
    check('registrations_price_nonnegative', sql`${t.priceCents} >= 0`),
  ]
);

export const registrationRoles = sqliteTable(
  'registration_roles',
  {
    registrationId: integer('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.registrationId, t.roleId] })]
);

export const waitlistOffers = sqliteTable(
  'waitlist_offers',
  {
    id: id(),
    registrationId: integer('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    offeredAt: createdAt(),
    expiresAt: text('expires_at').notNull(),
    acceptedAt: text('accepted_at'),
    closedAt: text('closed_at'),
  },
  (t) => [index('waitlist_offers_registration_idx').on(t.registrationId)]
);

export const consents = sqliteTable(
  'consents',
  {
    id: id(),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CONSENT_KINDS }).notNull(),
    documentId: integer('document_id').references(() => legalDocuments.id, { onDelete: 'restrict' }),
    eventId: integer('event_id').references(() => events.id, { onDelete: 'set null' }),
    grantedAt: createdAt(),
    revokedAt: text('revoked_at'),
    source: text('source', { enum: SOURCES }).notNull(),
  },
  (t) => [index('consents_person_idx').on(t.personId, t.kind)]
);

// ---------------------------------------------------------------------------
// Sponsoren (vor Zahlungen/Rechnungen, weil diese darauf verweisen)
// ---------------------------------------------------------------------------

export const sponsorPackages = sqliteTable(
  'sponsor_packages',
  {
    id: id(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: text('name', { mode: 'json' }).$type<LocalizedText>().notNull(),
    benefits: text('benefits', { mode: 'json' }).$type<LocalizedList>().notNull(),
    priceCents: integer('price_cents').notNull(),
    vatRateBp: integer('vat_rate_bp').notNull().default(2000),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('sponsor_packages_event_idx').on(t.eventId)]
);

export const sponsors = sqliteTable(
  'sponsors',
  {
    id: id(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    companyName: text('company_name').notNull(),
    packageId: integer('package_id').references(() => sponsorPackages.id, { onDelete: 'restrict' }),
    billingAddress: text('billing_address').notNull().default(''),
    /** UID des Sponsors (Pflicht auf Rechnungen über 10.000 € brutto bei regulärer USt) */
    vatId: text('vat_id'),
    discountCents: integer('discount_cents').notNull().default(0),
    dueOn: text('due_on'),
    paymentStatus: text('payment_status', { enum: SPONSOR_PAYMENT_STATUSES }).notNull().default('open'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [index('sponsors_event_idx').on(t.eventId)]
);

export const sponsorContacts = sqliteTable(
  'sponsor_contacts',
  {
    id: id(),
    sponsorId: integer('sponsor_id')
      .notNull()
      .references(() => sponsors.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    function: text('function'),
  },
  (t) => [uniqueIndex('sponsor_contacts_sponsor_person_uq').on(t.sponsorId, t.personId)]
);

// ---------------------------------------------------------------------------
// Zahlungen, Erstattungen, Rechnungen
// ---------------------------------------------------------------------------

export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    registrationId: integer('registration_id').references(() => registrations.id, { onDelete: 'restrict' }),
    sponsorId: integer('sponsor_id').references(() => sponsors.id, { onDelete: 'restrict' }),
    method: text('method', { enum: PAYMENT_RECORD_METHODS }).notNull(),
    status: text('status', { enum: PAYMENT_RECORD_STATUSES }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
    /** zufällige Referenz für Rücksprung-URLs der Kasse (nicht erratbar, keine Personendaten) */
    publicRef: text('public_ref').unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    createdAt: createdAt(),
    paidAt: text('paid_at'),
    recordedBy: text('recorded_by'),
  },
  (t) => [
    index('payments_registration_idx').on(t.registrationId),
    index('payments_sponsor_idx').on(t.sponsorId),
    check(
      'payments_exactly_one_owner',
      sql`(${t.registrationId} IS NULL) <> (${t.sponsorId} IS NULL)`
    ),
    check('payments_amount_nonnegative', sql`${t.amountCents} >= 0`),
  ]
);

export const refunds = sqliteTable(
  'refunds',
  {
    id: id(),
    paymentId: integer('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    status: text('status', { enum: REFUND_STATUSES }).notNull(),
    reason: text('reason').notNull(),
    /** Prozentsatz aus den Stornobedingungen, falls automatisch berechnet */
    rulePercent: integer('rule_percent'),
    stripeRefundId: text('stripe_refund_id').unique(),
    proposedAt: createdAt(),
    decidedBy: text('decided_by'),
    decidedAt: text('decided_at'),
    executedAt: text('executed_at'),
    failureMessage: text('failure_message'),
    /** Gutschrift, die bei Ausführung der Erstattung ausgestellt wurde */
    creditNoteId: integer('credit_note_id').references((): AnySQLiteColumn => invoices.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_status_idx').on(t.status),
    check('refunds_amount_positive', sql`${t.amountCents} > 0`),
  ]
);

export type InvoiceParty = {
  name: string;
  company?: string | null;
  address: string;
  vatId?: string | null;
  email?: string | null;
  /** nur beim Veranstalter: Bankverbindung und Kleinunternehmer-Hinweis zum Zeitpunkt der Ausstellung */
  iban?: string | null;
  bic?: string | null;
  smallBusinessNote?: LocalizedText | null;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitGrossCents: number;
  vatRateBp: number;
  netCents: number;
  vatCents: number;
  grossCents: number;
};

/** Rechnungen und Gutschriften – nach dem Ausstellen unveränderlich. */
export const invoices = sqliteTable(
  'invoices',
  {
    id: id(),
    type: text('type', { enum: INVOICE_TYPES }).notNull(),
    number: text('number').notNull().unique(),
    relatedInvoiceId: integer('related_invoice_id').references((): AnySQLiteColumn => invoices.id, {
      onDelete: 'restrict',
    }),
    registrationId: integer('registration_id').references(() => registrations.id, { onDelete: 'restrict' }),
    sponsorId: integer('sponsor_id').references(() => sponsors.id, { onDelete: 'restrict' }),
    locale: text('locale', { enum: LOCALES }).notNull(),
    issuedAt: createdAt(),
    serviceDate: text('service_date').notNull(),
    dueAt: text('due_at'),
    recipient: text('recipient', { mode: 'json' }).$type<InvoiceParty>().notNull(),
    organizer: text('organizer', { mode: 'json' }).$type<InvoiceParty>().notNull(),
    items: text('items', { mode: 'json' }).$type<InvoiceItem[]>().notNull(),
    vatMode: text('vat_mode', { enum: VAT_MODES }).notNull(),
    netCents: integer('net_cents').notNull(),
    vatCents: integer('vat_cents').notNull(),
    grossCents: integer('gross_cents').notNull(),
    /** Hinweistext auf dem Beleg (z. B. Grund einer Gutschrift) – Teil des Belegs, unveränderlich */
    note: text('note'),
    pdfPath: text('pdf_path'),
    /** Verwaltungsangabe (nicht Teil des Belegs): zuletzt per E-Mail versendet */
    sentAt: text('sent_at'),
    retainUntil: text('retain_until').notNull(),
    createdBy: text('created_by'),
  },
  (t) => [
    index('invoices_registration_idx').on(t.registrationId),
    index('invoices_sponsor_idx').on(t.sponsorId),
    check('invoices_exactly_one_owner', sql`(${t.registrationId} IS NULL) <> (${t.sponsorId} IS NULL)`),
    check('invoices_totals_consistent', sql`${t.netCents} + ${t.vatCents} = ${t.grossCents}`),
    check(
      'invoices_credit_note_has_reference',
      sql`(${t.type} = 'credit_note') = (${t.relatedInvoiceId} IS NOT NULL)`
    ),
  ]
);

/** Lückenloser Nummernkreis je Kalenderjahr (gemeinsam für Rechnungen und Gutschriften). */
export const invoiceCounters = sqliteTable('invoice_counters', {
  year: integer('year').primaryKey(),
  lastNumber: integer('last_number').notNull(),
});

export const paymentReminders = sqliteTable(
  'payment_reminders',
  {
    id: id(),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    sentAt: createdAt(),
    level: integer('level').notNull(),
  },
  (t) => [uniqueIndex('payment_reminders_invoice_level_uq').on(t.invoiceId, t.level)]
);

/** Verarbeitete Stripe-Webhook-Ereignisse (Idempotenz). */
export const stripeEvents = sqliteTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: createdAt(),
  processedAt: text('processed_at'),
  result: text('result'),
});

// ---------------------------------------------------------------------------
// Programm und Speaker
// ---------------------------------------------------------------------------

export const speakers = sqliteTable(
  'speakers',
  {
    id: id(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    proposalStatus: text('proposal_status', { enum: PROPOSAL_STATUSES }).notNull().default('pending'),
    slidesStatus: text('slides_status', { enum: SLIDES_STATUSES }).notNull().default('missing'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('speakers_event_person_uq').on(t.eventId, t.personId)]
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    title: text('title', { mode: 'json' }).$type<LocalizedText>().notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    location: text('location').notNull().default(''),
    tag: text('tag', { enum: SESSION_TAGS }).notNull().default('talk'),
    stream: integer('stream').notNull().default(1),
    speakerId: integer('speaker_id').references(() => speakers.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('sessions_event_start_idx').on(t.eventId, t.startsAt),
    check('sessions_stream_range', sql`${t.stream} BETWEEN 1 AND 4`),
    check('sessions_time_order', sql`${t.endsAt} > ${t.startsAt}`),
  ]
);

// ---------------------------------------------------------------------------
// Betrieb und DSGVO
// ---------------------------------------------------------------------------

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    at: createdAt(),
    /** Better-Auth-User-ID; NULL = System (Webhook, Zeitplan) */
    actorUserId: text('actor_user_id'),
    eventId: integer('event_id').references(() => events.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    /** kurze Beschreibung ohne personenbezogene Daten */
    summary: text('summary').notNull().default(''),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_event_idx').on(t.eventId),
  ]
);

/** Anfragen betroffener Personen (Art. 15–21 DSGVO). */
export const dsrRequests = sqliteTable(
  'dsr_requests',
  {
    id: id(),
    personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
    type: text('type', { enum: DSR_TYPES }).notNull(),
    receivedAt: text('received_at').notNull(),
    completedAt: text('completed_at'),
    handledBy: text('handled_by'),
    notes: text('notes'),
  },
  (t) => [index('dsr_requests_received_idx').on(t.receivedAt)]
);

// ---------------------------------------------------------------------------
// Anmeldung (Better Auth) – Tabellen- und Feldnamen gemäß Better Auth 1.7,
// Modelle: user, session, account, verification, twoFactor (Zuordnung in src/server/auth/config.ts).
// Ausnahme von der Zeitstempel-Konvention: Better Auth arbeitet mit Date-Objekten,
// daher hier INTEGER in Millisekunden (timestamp_ms).
// ---------------------------------------------------------------------------

export const USER_ROLES = ['admin', 'attendee'] as const;

const authTimestamp = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date());

export const authUsers = sqliteTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: authTimestamp('created_at'),
  updatedAt: authTimestamp('updated_at'),
  /** zusätzliches Feld: Rolle (nur serverseitig setzbar) */
  role: text('role', { enum: USER_ROLES }).notNull().default('attendee'),
  /** zusätzliches Feld: Verknüpfung zur Person (Teilnehmerportal) */
  personId: integer('person_id').references(() => people.id, { onDelete: 'set null' }),
  /** vom 2FA-Plugin verwaltet */
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).default(false),
});

export const authSessions = sqliteTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: authTimestamp('created_at'),
    updatedAt: authTimestamp('updated_at'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)]
);

export const authAccounts = sqliteTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    /** Passwort-Hash (nur bei providerId = 'credential') */
    password: text('password'),
    createdAt: authTimestamp('created_at'),
    updatedAt: authTimestamp('updated_at'),
  },
  (t) => [index('auth_accounts_user_idx').on(t.userId)]
);

export const authVerifications = sqliteTable(
  'auth_verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: authTimestamp('created_at'),
    updatedAt: authTimestamp('updated_at'),
  },
  (t) => [index('auth_verifications_identifier_idx').on(t.identifier)]
);

export const authTwoFactors = sqliteTable(
  'auth_two_factors',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    verified: integer('verified', { mode: 'boolean' }).default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
  },
  (t) => [index('auth_two_factors_secret_idx').on(t.secret), index('auth_two_factors_user_idx').on(t.userId)]
);
