CREATE TABLE `user_states` (
	`user_email` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_states_updated_at_idx` ON `user_states` (`updated_at`);--> statement-breakpoint
DROP INDEX `progress_photos_captured_on_unique`;--> statement-breakpoint
ALTER TABLE `progress_photos` ADD `owner_email` text;--> statement-breakpoint
CREATE UNIQUE INDEX `progress_photos_owner_date_unique` ON `progress_photos` (`owner_email`,`captured_on`);