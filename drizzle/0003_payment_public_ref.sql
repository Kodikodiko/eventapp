ALTER TABLE `payments` ADD `public_ref` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_public_ref_unique` ON `payments` (`public_ref`);