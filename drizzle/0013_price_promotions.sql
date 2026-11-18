CREATE TABLE `discount_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`code` text NOT NULL,
	`kind` text NOT NULL,
	`value` integer NOT NULL,
	`valid_from` text,
	`valid_until` text,
	`max_uses` integer,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "discount_codes_value_positive" CHECK("discount_codes"."value" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discount_codes_event_code_uq` ON `discount_codes` (`event_id`,`code`);--> statement-breakpoint
CREATE TABLE `price_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "price_categories_price_nonnegative" CHECK("price_categories"."price_cents" >= 0)
);
--> statement-breakpoint
CREATE INDEX `price_categories_event_idx` ON `price_categories` (`event_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `early_bird_starts_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `early_bird_ends_at` text;--> statement-breakpoint
ALTER TABLE `events` ADD `price_early_normal_cents` integer;--> statement-breakpoint
ALTER TABLE `events` ADD `price_early_member_cents` integer;--> statement-breakpoint
ALTER TABLE `registrations` ADD `price_tier` text DEFAULT 'regular' NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `price_category_id` integer REFERENCES price_categories(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `registrations` ADD `discount_code_id` integer REFERENCES discount_codes(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `registrations` ADD `discount_cents` integer DEFAULT 0 NOT NULL;