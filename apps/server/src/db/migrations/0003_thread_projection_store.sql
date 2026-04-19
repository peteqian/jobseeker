CREATE TABLE `thread_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`command_type` text NOT NULL,
	`command_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_thread_commands_thread_created`
ON `thread_commands` (`thread_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `thread_events` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`event_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_thread_events_thread_sequence`
ON `thread_events` (`thread_id`, `sequence`);
--> statement-breakpoint
CREATE INDEX `idx_thread_events_thread_sequence`
ON `thread_events` (`thread_id`, `sequence`);
--> statement-breakpoint
CREATE TABLE `thread_projections` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`latest_sequence` integer NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
