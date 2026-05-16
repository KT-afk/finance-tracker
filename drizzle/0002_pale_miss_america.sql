CREATE TABLE `balance_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank` text NOT NULL,
	`balance` real NOT NULL,
	`recorded_at` text NOT NULL
);
