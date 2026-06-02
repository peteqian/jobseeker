ALTER TABLE `job_matches` ADD `level` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `description_text` text;