CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scope` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `thread_id` text REFERENCES chat_threads(id) ON DELETE cascade;
--> statement-breakpoint
INSERT INTO `chat_threads` (`id`, `project_id`, `scope`, `title`, `status`, `created_at`, `updated_at`)
SELECT
	'thread_coach_' || `projects`.`id`,
	`projects`.`id`,
	'coach',
	'Coach',
	'active',
	`projects`.`created_at`,
	`projects`.`updated_at`
FROM `projects`
WHERE NOT EXISTS (
	SELECT 1 FROM `chat_threads`
	WHERE `chat_threads`.`project_id` = `projects`.`id` AND `chat_threads`.`scope` = 'coach'
);
--> statement-breakpoint
INSERT INTO `chat_threads` (`id`, `project_id`, `scope`, `title`, `status`, `created_at`, `updated_at`)
SELECT
	'thread_explorer_' || `projects`.`id`,
	`projects`.`id`,
	'explorer',
	'Explorer',
	'active',
	`projects`.`created_at`,
	`projects`.`updated_at`
FROM `projects`
WHERE NOT EXISTS (
	SELECT 1 FROM `chat_threads`
	WHERE `chat_threads`.`project_id` = `projects`.`id` AND `chat_threads`.`scope` = 'explorer'
);
--> statement-breakpoint
UPDATE `chat_messages`
SET `thread_id` = 'thread_coach_' || `chat_messages`.`project_id`
WHERE `thread_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_chat_threads_project_scope`
ON `chat_threads` (`project_id`, `scope`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_thread_id`
ON `chat_messages` (`thread_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `provider_session_runtime` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`provider_name` text NOT NULL,
	`adapter_key` text NOT NULL,
	`status` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`resume_cursor_json` text,
	`runtime_payload_json` text,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_provider_session_runtime_status`
ON `provider_session_runtime` (`status`);
