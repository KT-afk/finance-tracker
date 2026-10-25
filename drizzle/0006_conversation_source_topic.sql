ALTER TABLE `ai_conversations` ADD `source` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_conversations` ADD `topic` text DEFAULT 'ask' NOT NULL;