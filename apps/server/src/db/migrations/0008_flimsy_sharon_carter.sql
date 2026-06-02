CREATE TABLE `tailoring_reviews` (
	`project_id` text NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`document_id` text NOT NULL,
	`score` real NOT NULL,
	`issues_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `job_id`, `kind`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
