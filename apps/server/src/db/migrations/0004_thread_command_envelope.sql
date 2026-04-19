ALTER TABLE `thread_commands` RENAME TO `thread_commands_old`;
--> statement-breakpoint
CREATE TABLE `thread_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`command_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`command_type` text NOT NULL,
	`actor` text NOT NULL,
	`session_id` text NOT NULL,
	`command_created_at` text NOT NULL,
	`command_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `thread_commands` (
	`id`,
	`command_id`,
	`thread_id`,
	`command_type`,
	`actor`,
	`session_id`,
	`command_created_at`,
	`command_json`,
	`created_at`
)
SELECT
	`id`,
	`id`,
	`thread_id`,
	`command_type`,
	'unknown',
	'unknown',
	`created_at`,
	`command_json`,
	`created_at`
FROM `thread_commands_old`;
--> statement-breakpoint
DROP TABLE `thread_commands_old`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_thread_commands_command_id`
ON `thread_commands` (`command_id`);
--> statement-breakpoint
CREATE INDEX `idx_thread_commands_thread_created`
ON `thread_commands` (`thread_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_thread_commands_thread_command_created`
ON `thread_commands` (`thread_id`, `command_created_at`);
