CREATE TABLE `event_comparisons` (
	`event_id` integer NOT NULL,
	`compare_event_id` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`event_id`, `compare_event_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`compare_event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_plan_budgets` (
	`plan_id` integer NOT NULL,
	`cost_group_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	PRIMARY KEY(`plan_id`, `cost_group_id`),
	FOREIGN KEY (`plan_id`) REFERENCES `event_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cost_group_id`) REFERENCES `event_cost_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_plan_budgets_nonnegative" CHECK("event_plan_budgets"."amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE `event_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`variant` text NOT NULL,
	`tickets_normal` integer DEFAULT 0 NOT NULL,
	`tickets_member` integer DEFAULT 0 NOT NULL,
	`tickets_special` integer DEFAULT 0 NOT NULL,
	`tickets_free` integer DEFAULT 0 NOT NULL,
	`price_normal_cents` integer,
	`price_member_cents` integer,
	`price_special_cents` integer,
	`sponsor_income_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "event_plans_nonnegative" CHECK("event_plans"."tickets_normal" >= 0 AND "event_plans"."tickets_member" >= 0 AND "event_plans"."tickets_special" >= 0 AND "event_plans"."tickets_free" >= 0 AND "event_plans"."sponsor_income_cents" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_plans_event_variant_uq` ON `event_plans` (`event_id`,`variant`);