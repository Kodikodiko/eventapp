ALTER TABLE `events` ADD `terms_mode` text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `vat_mode` text;--> statement-breakpoint
ALTER TABLE `events` ADD `registration_paused` integer DEFAULT false NOT NULL;