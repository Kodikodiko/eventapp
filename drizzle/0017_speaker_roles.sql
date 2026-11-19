-- Datenmigration (Geschäftsregel Speaker, siehe services/speaker-role.ts); archivierte Events bleiben unverändert.
-- 1) Speaker ohne aktive Anmeldung bekommen eine kostenlose, bestätigte Speaker-Anmeldung.
INSERT INTO `registrations` (`event_id`, `person_id`, `status`, `payment_status`, `payment_method`, `ticket_type`, `price_cents`, `source`, `confirmed_at`, `qr_token`)
SELECT `s`.`event_id`, `s`.`person_id`, 'confirmed', 'not_required', 'free', 'normal', 0, 'admin', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6)))
FROM `speakers` `s`
INNER JOIN `events` `e` ON `e`.`id` = `s`.`event_id` AND `e`.`archived_at` IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM `registrations` `r` WHERE `r`.`event_id` = `s`.`event_id` AND `r`.`person_id` = `s`.`person_id` AND `r`.`status` <> 'cancelled'
);
--> statement-breakpoint
-- 2) Alle aktiven Anmeldungen von Speakern bekommen die Rolle „speaker“ (die neuen aus Schritt 1 nur diese).
INSERT OR IGNORE INTO `registration_roles` (`registration_id`, `role_id`)
SELECT `r`.`id`, `ro`.`id`
FROM `speakers` `s`
INNER JOIN `registrations` `r` ON `r`.`event_id` = `s`.`event_id` AND `r`.`person_id` = `s`.`person_id` AND `r`.`status` <> 'cancelled'
INNER JOIN `events` `e` ON `e`.`id` = `s`.`event_id` AND `e`.`archived_at` IS NULL
INNER JOIN `roles` `ro` ON `ro`.`key` = 'speaker';
