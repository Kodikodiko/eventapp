ALTER TABLE `events` ADD `slides_public` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `terms_mode`;--> statement-breakpoint
ALTER TABLE `speakers` ADD `slides_url` text;--> statement-breakpoint
ALTER TABLE `sponsors` ADD `custom_price_cents` integer;--> statement-breakpoint
ALTER TABLE `sponsors` ADD `custom_vat_rate_bp` integer;