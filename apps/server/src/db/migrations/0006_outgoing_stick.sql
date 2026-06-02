CREATE TABLE `resume_analyses` (
	`project_id` text NOT NULL,
	`resume_doc_id` text NOT NULL,
	`kind` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `resume_doc_id`, `kind`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
