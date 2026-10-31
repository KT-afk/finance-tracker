CREATE TABLE `trip_payments` (
	`trip_key` text NOT NULL,
	`transaction_id` text NOT NULL,
	`included` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`trip_key`, `transaction_id`)
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`country` text,
	`updated_at` text NOT NULL
);
