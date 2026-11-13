CREATE TABLE `event_streams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_streams_position_range" CHECK("event_streams"."position" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_streams_event_position_uq` ON `event_streams` (`event_id`,`position`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`tag` text DEFAULT 'talk' NOT NULL,
	`stream` integer DEFAULT 1 NOT NULL,
	`stream_to` integer,
	`speaker_id` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`speaker_id`) REFERENCES `speakers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "sessions_stream_range" CHECK("__new_sessions"."stream" BETWEEN 1 AND 10),
	CONSTRAINT "sessions_stream_to_range" CHECK("__new_sessions"."stream_to" IS NULL OR ("__new_sessions"."stream_to" BETWEEN "__new_sessions"."stream" AND 10)),
	CONSTRAINT "sessions_time_order" CHECK("__new_sessions"."ends_at" > "__new_sessions"."starts_at")
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id", "event_id", "title", "starts_at", "ends_at", "location", "tag", "stream", "stream_to", "speaker_id") SELECT "id", "event_id", "title", "starts_at", "ends_at", "location", "tag", "stream", "stream", "speaker_id" FROM `sessions`;--> statement-breakpoint
DROP TABLE `sessions`;--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `sessions_event_start_idx` ON `sessions` (`event_id`,`starts_at`);--> statement-breakpoint
-- Streams für bestehende Events: „Stream 1“ bis zum höchsten verwendeten Stream (mindestens einer)
INSERT INTO `event_streams` (`event_id`, `position`, `name`)
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 10)
SELECT e.`id`, n.x, json_object('de', 'Stream ' || n.x, 'en', 'Stream ' || n.x)
FROM `events` e JOIN n ON n.x <= max(1, coalesce((SELECT max(s.`stream`) FROM `sessions` s WHERE s.`event_id` = e.`id`), 1));--> statement-breakpoint
-- Bisher wurde ein allein stehender Punkt der Art „Allgemein“/„Pause“ in der Druckansicht über die ganze Breite gezeigt:
-- solche Punkte gehen jetzt ausdrücklich über alle Streams des Events.
UPDATE `sessions` SET `stream` = 1, `stream_to` = (SELECT max(es.`position`) FROM `event_streams` es WHERE es.`event_id` = `sessions`.`event_id`)
WHERE `tag` IN ('general', 'break')
  AND (SELECT max(es.`position`) FROM `event_streams` es WHERE es.`event_id` = `sessions`.`event_id`) > 1
  AND NOT EXISTS (SELECT 1 FROM `sessions` o WHERE o.`event_id` = `sessions`.`event_id` AND o.`id` <> `sessions`.`id` AND o.`starts_at` < `sessions`.`ends_at` AND o.`ends_at` > `sessions`.`starts_at`);
