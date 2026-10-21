CREATE TABLE `alert_emails` (
	`message_id` text PRIMARY KEY NOT NULL,
	`bank` text NOT NULL,
	`received_at` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`transaction_id` text,
	`processed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_tokens` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `source` text DEFAULT 'statement' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `time` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `payee` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `memo` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `foreign_amount` real;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `confirmed_at` text;