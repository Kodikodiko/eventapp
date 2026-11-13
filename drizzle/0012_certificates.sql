CREATE TABLE `event_certificates` (
	`event_id` integer PRIMARY KEY NOT NULL,
	`heading` text NOT NULL,
	`body` text NOT NULL,
	`text_color` text DEFAULT '#1a1a1a' NOT NULL,
	`image_path` text,
	`image_name` text,
	`image_type` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
