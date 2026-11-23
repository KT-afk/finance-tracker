CREATE TABLE `investments` (
	`key` text PRIMARY KEY NOT NULL,
	`put_in_before` real,
	`value` real,
	`value_as_of` text,
	`updated_at` text NOT NULL
);
