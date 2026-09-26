CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`actor_user_id` text,
	`event_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`summary` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_event_idx` ON `audit_log` (`event_id`);--> statement-breakpoint
CREATE TABLE `cancellation_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`days_before_event` integer NOT NULL,
	`refund_percent` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cancellation_rules_percent_range" CHECK("cancellation_rules"."refund_percent" BETWEEN 0 AND 100),
	CONSTRAINT "cancellation_rules_days_nonnegative" CHECK("cancellation_rules"."days_before_event" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cancellation_rules_event_days_uq` ON `cancellation_rules` (`event_id`,`days_before_event`);--> statement-breakpoint
CREATE TABLE `consents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`kind` text NOT NULL,
	`document_id` integer,
	`event_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`revoked_at` text,
	`source` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `legal_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `consents_person_idx` ON `consents` (`person_id`,`kind`);--> statement-breakpoint
CREATE TABLE `dsr_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer,
	`type` text NOT NULL,
	`received_at` text NOT NULL,
	`completed_at` text,
	`handled_by` text,
	`notes` text,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `dsr_requests_received_idx` ON `dsr_requests` (`received_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`location` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`capacity` integer NOT NULL,
	`registration_opens_at` text,
	`registration_closes_at` text,
	`price_normal_cents` integer NOT NULL,
	`price_member_cents` integer NOT NULL,
	`ticket_vat_rate_bp` integer DEFAULT 2000 NOT NULL,
	`allow_stripe` integer DEFAULT true NOT NULL,
	`allow_invoice` integer DEFAULT true NOT NULL,
	`refund_mode` text DEFAULT 'automatic' NOT NULL,
	`terms_document_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`terms_document_id`) REFERENCES `legal_documents`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "events_capacity_nonnegative" CHECK("events"."capacity" >= 0),
	CONSTRAINT "events_prices_nonnegative" CHECK("events"."price_normal_cents" >= 0 AND "events"."price_member_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_starts_at_idx` ON `events` (`starts_at`);--> statement-breakpoint
CREATE TABLE `invoice_counters` (
	`year` integer PRIMARY KEY NOT NULL,
	`last_number` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`number` text NOT NULL,
	`related_invoice_id` integer,
	`registration_id` integer,
	`sponsor_id` integer,
	`locale` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`service_date` text NOT NULL,
	`due_at` text,
	`recipient` text NOT NULL,
	`organizer` text NOT NULL,
	`items` text NOT NULL,
	`vat_mode` text NOT NULL,
	`net_cents` integer NOT NULL,
	`vat_cents` integer NOT NULL,
	`gross_cents` integer NOT NULL,
	`pdf_path` text,
	`retain_until` text NOT NULL,
	`created_by` text,
	FOREIGN KEY (`related_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "invoices_exactly_one_owner" CHECK(("invoices"."registration_id" IS NULL) <> ("invoices"."sponsor_id" IS NULL)),
	CONSTRAINT "invoices_totals_consistent" CHECK("invoices"."net_cents" + "invoices"."vat_cents" = "invoices"."gross_cents"),
	CONSTRAINT "invoices_credit_note_has_reference" CHECK(("invoices"."type" = 'credit_note') = ("invoices"."related_invoice_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`number`);--> statement-breakpoint
CREATE INDEX `invoices_registration_idx` ON `invoices` (`registration_id`);--> statement-breakpoint
CREATE INDEX `invoices_sponsor_idx` ON `invoices` (`sponsor_id`);--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`event_id` integer,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`valid_from` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `legal_documents_kind_event_idx` ON `legal_documents` (`kind`,`event_id`,`version`);--> statement-breakpoint
CREATE TABLE `member_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`uploaded_by` text,
	`file_name` text NOT NULL,
	`row_count` integer NOT NULL,
	`added_count` integer NOT NULL,
	`updated_count` integer NOT NULL,
	`removed_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_number` text NOT NULL,
	`last_name` text NOT NULL,
	`first_name` text,
	`email` text,
	`valid_until` text,
	`imported_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_member_number_unique` ON `members` (`member_number`);--> statement-breakpoint
CREATE INDEX `members_last_name_idx` ON `members` (`last_name`);--> statement-breakpoint
CREATE TABLE `organizer_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`vat_id` text,
	`iban` text,
	`bic` text,
	`contact_email` text,
	`vat_mode` text DEFAULT 'small_business' NOT NULL,
	`small_business_note` text,
	`invoice_payment_term_days` integer DEFAULT 14 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "organizer_settings_single_row" CHECK("organizer_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `payment_reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`level` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_reminders_invoice_level_uq` ON `payment_reminders` (`invoice_id`,`level`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`registration_id` integer,
	`sponsor_id` integer,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`paid_at` text,
	`recorded_by` text,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "payments_exactly_one_owner" CHECK(("payments"."registration_id" IS NULL) <> ("payments"."sponsor_id" IS NULL)),
	CONSTRAINT "payments_amount_nonnegative" CHECK("payments"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_stripe_checkout_session_id_unique` ON `payments` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `payments_registration_idx` ON `payments` (`registration_id`);--> statement-breakpoint
CREATE INDEX `payments_sponsor_idx` ON `payments` (`sponsor_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`company` text,
	`phone` text,
	`locale` text DEFAULT 'de' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`restricted_at` text,
	`anonymized_at` text,
	CONSTRAINT "people_email_lowercase" CHECK("people"."email" IS NULL OR "people"."email" = lower("people"."email"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_email_unique` ON `people` (`email`);--> statement-breakpoint
CREATE INDEX `people_last_name_idx` ON `people` (`last_name`);--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text NOT NULL,
	`rule_percent` integer,
	`stripe_refund_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`decided_by` text,
	`decided_at` text,
	`executed_at` text,
	`failure_message` text,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "refunds_amount_positive" CHECK("refunds"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_stripe_refund_id_unique` ON `refunds` (`stripe_refund_id`);--> statement-breakpoint
CREATE INDEX `refunds_payment_idx` ON `refunds` (`payment_id`);--> statement-breakpoint
CREATE INDEX `refunds_status_idx` ON `refunds` (`status`);--> statement-breakpoint
CREATE TABLE `registration_roles` (
	`registration_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	PRIMARY KEY(`registration_id`, `role_id`),
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `registrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`status` text NOT NULL,
	`payment_status` text NOT NULL,
	`payment_method` text NOT NULL,
	`ticket_type` text DEFAULT 'normal' NOT NULL,
	`member_id` integer,
	`member_number_entered` text,
	`price_cents` integer NOT NULL,
	`billing_company` text,
	`billing_address` text,
	`source` text NOT NULL,
	`reserved_until` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`confirmed_at` text,
	`cancelled_at` text,
	`cancel_reason` text,
	`checked_in_at` text,
	`qr_token` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "registrations_price_nonnegative" CHECK("registrations"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_qr_token_unique` ON `registrations` (`qr_token`);--> statement-breakpoint
CREATE INDEX `registrations_event_status_idx` ON `registrations` (`event_id`,`status`);--> statement-breakpoint
CREATE INDEX `registrations_person_idx` ON `registrations` (`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_event_person_active_uq` ON `registrations` (`event_id`,`person_id`) WHERE status <> 'cancelled';--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_key_unique` ON `roles` (`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`tag` text DEFAULT 'talk' NOT NULL,
	`stream` integer DEFAULT 1 NOT NULL,
	`speaker_id` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`speaker_id`) REFERENCES `speakers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sessions_stream_range" CHECK("sessions"."stream" BETWEEN 1 AND 4),
	CONSTRAINT "sessions_time_order" CHECK("sessions"."ends_at" > "sessions"."starts_at")
);
--> statement-breakpoint
CREATE INDEX `sessions_event_start_idx` ON `sessions` (`event_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `speakers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`proposal_status` text DEFAULT 'pending' NOT NULL,
	`slides_status` text DEFAULT 'missing' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `speakers_event_person_uq` ON `speakers` (`event_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `sponsor_contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sponsor_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`function` text,
	FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sponsor_contacts_sponsor_person_uq` ON `sponsor_contacts` (`sponsor_id`,`person_id`);--> statement-breakpoint
CREATE TABLE `sponsor_packages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`benefits` text NOT NULL,
	`price_cents` integer NOT NULL,
	`vat_rate_bp` integer DEFAULT 2000 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sponsor_packages_event_idx` ON `sponsor_packages` (`event_id`);--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`company_name` text NOT NULL,
	`package_id` integer,
	`billing_address` text DEFAULT '' NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`due_on` text,
	`payment_status` text DEFAULT 'open' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`package_id`) REFERENCES `sponsor_packages`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `sponsors_event_idx` ON `sponsors` (`event_id`);--> statement-breakpoint
CREATE TABLE `stripe_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`processed_at` text,
	`result` text
);
--> statement-breakpoint
CREATE TABLE `waitlist_offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`registration_id` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`closed_at` text,
	FOREIGN KEY (`registration_id`) REFERENCES `registrations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `waitlist_offers_token_unique` ON `waitlist_offers` (`token`);--> statement-breakpoint
CREATE INDEX `waitlist_offers_registration_idx` ON `waitlist_offers` (`registration_id`);