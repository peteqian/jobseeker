CREATE TABLE `application_answers` (
	`project_id` text NOT NULL,
	`question_key` text NOT NULL,
	`answer` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `question_key`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
