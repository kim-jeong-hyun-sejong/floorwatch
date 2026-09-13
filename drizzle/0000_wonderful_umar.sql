CREATE TABLE `floor_signals` (
	`room` text NOT NULL,
	`floor` integer NOT NULL,
	`count` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`room`, `floor`)
);
