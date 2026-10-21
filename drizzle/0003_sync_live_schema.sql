-- Tables the app used to create on first use. IF NOT EXISTS so this is
-- safe on databases that already have them.
CREATE TABLE IF NOT EXISTS `insight_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `owed_dismissed` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `owed_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`person` text NOT NULL,
	`kind` text NOT NULL,
	`amount` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `owed_entries_transaction_id_unique` ON `owed_entries` (`transaction_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `owed_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`person` text NOT NULL,
	`amount` real NOT NULL,
	`starts_on` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `owed_rules_keyword_unique` ON `owed_rules` (`keyword`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `owed_senders` (
	`sender` text PRIMARY KEY NOT NULL,
	`person` text NOT NULL,
	`created_at` text NOT NULL
);
