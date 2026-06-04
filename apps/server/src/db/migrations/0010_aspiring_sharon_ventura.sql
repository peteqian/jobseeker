CREATE TABLE `job_applications` (
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`applied_at` text NOT NULL,
	`interview_rounds` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `job_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
