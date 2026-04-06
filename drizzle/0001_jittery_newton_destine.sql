CREATE TABLE `ai_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question` text NOT NULL,
	`answer_text` text NOT NULL,
	`answer_data` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_memory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_memory_key_unique` ON `ai_memory` (`key`);