CREATE TABLE `event_gallery_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`image_path` text NOT NULL,
	`image_name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `event_gallery_images_event_idx` ON `event_gallery_images` (`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `session_speakers` (
	`session_id` integer NOT NULL,
	`speaker_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`session_id`, `speaker_id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`speaker_id`) REFERENCES `speakers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_speakers_speaker_idx` ON `session_speakers` (`speaker_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `tagline` text;--> statement-breakpoint
ALTER TABLE `events` ADD `highlights` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `hero_image_path` text;--> statement-breakpoint
ALTER TABLE `events` ADD `hero_image_name` text;--> statement-breakpoint
ALTER TABLE `speakers` ADD `role` text;--> statement-breakpoint
ALTER TABLE `speakers` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `speakers` ADD `photo_path` text;--> statement-breakpoint
ALTER TABLE `sponsors` ADD `logo_path` text;--> statement-breakpoint
ALTER TABLE `sponsors` ADD `website` text;