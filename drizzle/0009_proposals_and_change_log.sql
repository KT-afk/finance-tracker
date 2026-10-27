CREATE TABLE `agent_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`summary` text NOT NULL,
	`source` text NOT NULL,
	`request` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`source` text NOT NULL,
	`request` text NOT NULL,
	`proposal_id` text,
	`reverses_id` integer
);
