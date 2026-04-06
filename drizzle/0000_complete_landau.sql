CREATE TABLE `category_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`keyword` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_rules_keyword_unique` ON `category_rules` (`keyword`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`bank` text NOT NULL,
	`category` text DEFAULT 'Others' NOT NULL,
	`is_corrected` integer DEFAULT false NOT NULL,
	`hash` text NOT NULL,
	`uploaded_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_hash_unique` ON `transactions` (`hash`);