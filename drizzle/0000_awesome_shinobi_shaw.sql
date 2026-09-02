CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`captured_on` text NOT NULL,
	`weight` real NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `progress_photos_captured_on_unique` ON `progress_photos` (`captured_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_photos_object_key_unique` ON `progress_photos` (`object_key`);--> statement-breakpoint
CREATE INDEX `progress_photos_created_at_idx` ON `progress_photos` (`created_at`);