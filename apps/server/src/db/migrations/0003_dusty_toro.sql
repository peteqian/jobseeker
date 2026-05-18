CREATE TABLE `coach_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`topic` text NOT NULL,
	`evidence_summary` text NOT NULL,
	`discussion_seed` text NOT NULL,
	`severity` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `coach_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coach_review_jds` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`source` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `coach_reviews`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coach_thread_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`anchor_type` text NOT NULL,
	`anchor_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_coach_thread_anchors` ON `coach_thread_anchors` (`anchor_type`,`anchor_id`,`thread_id`);