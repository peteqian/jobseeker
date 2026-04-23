CREATE TABLE `claim_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `coach_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_claim_threads_claim_thread` ON `claim_threads` (`claim_id`,`thread_id`);--> statement-breakpoint
CREATE TABLE `coach_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`text` text NOT NULL,
	`status` text NOT NULL,
	`status_reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `coach_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coach_next_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`text` text NOT NULL,
	`completed` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `coach_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coach_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`resume_doc_id` text NOT NULL,
	`focus_area` text NOT NULL,
	`score` real NOT NULL,
	`issues_count` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_coach_reviews_project_created` ON `coach_reviews` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `coach_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `coach_claims`(`id`) ON UPDATE no action ON DELETE cascade
);
