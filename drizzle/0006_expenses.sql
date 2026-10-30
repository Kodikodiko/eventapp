CREATE TABLE `cost_group_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`speaker_link` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deactivated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cost_group_templates_name_uq` ON `cost_group_templates` (lower("name"));--> statement-breakpoint
CREATE TABLE `event_cost_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`template_id` integer,
	`name` text NOT NULL,
	`speaker_link` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deactivated_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`template_id`) REFERENCES `cost_group_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_cost_groups_event_idx` ON `event_cost_groups` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_cost_groups_event_name_uq` ON `event_cost_groups` (`event_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`cost_group_id` integer NOT NULL,
	`spent_on` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`vat_rate_bp` integer,
	`supplier` text,
	`description` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`speaker_id` integer,
	`receipt_path` text,
	`receipt_name` text,
	`receipt_type` text,
	`receipt_size` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`cost_group_id`) REFERENCES `event_cost_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`speaker_id`) REFERENCES `speakers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "expenses_amount_positive" CHECK("expenses"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `expenses_event_idx` ON `expenses` (`event_id`,`spent_on`);--> statement-breakpoint
CREATE INDEX `expenses_cost_group_idx` ON `expenses` (`cost_group_id`);--> statement-breakpoint
CREATE INDEX `expenses_speaker_idx` ON `expenses` (`speaker_id`);