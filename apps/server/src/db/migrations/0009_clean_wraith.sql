CREATE TABLE `tailoring_review_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`document_id` text NOT NULL,
	`score` real NOT NULL,
	`issues_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tailoring_review_history_job_kind` ON `tailoring_review_history` (`job_id`,`kind`);