ALTER TABLE `tailoring_review_history` ADD `fit_score` real;--> statement-breakpoint
ALTER TABLE `tailoring_review_history` ADD `shortlist` text;--> statement-breakpoint
ALTER TABLE `tailoring_review_history` ADD `gaps_json` text;--> statement-breakpoint
ALTER TABLE `tailoring_reviews` ADD `fit_score` real;--> statement-breakpoint
ALTER TABLE `tailoring_reviews` ADD `shortlist` text;--> statement-breakpoint
ALTER TABLE `tailoring_reviews` ADD `gaps_json` text;