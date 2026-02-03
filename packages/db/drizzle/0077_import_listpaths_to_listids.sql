CREATE TABLE `importStagingBookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`importSessionId` text NOT NULL,
	`type` text NOT NULL,
	`url` text,
	`title` text,
	`content` text,
	`note` text,
	`tags` text,
	`listIds` text,
	`sourceAddedAt` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`processingStartedAt` integer,
	`result` text,
	`resultReason` text,
	`resultBookmarkId` text,
	`createdAt` integer NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`importSessionId`) REFERENCES `importSessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resultBookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `importStaging_session_status_idx` ON `importStagingBookmarks` (`importSessionId`,`status`);--> statement-breakpoint
CREATE INDEX `importStaging_completedAt_idx` ON `importStagingBookmarks` (`completedAt`);--> statement-breakpoint
ALTER TABLE `importSessions` ADD `status` text DEFAULT 'staging' NOT NULL;--> statement-breakpoint
ALTER TABLE `importSessions` ADD `lastProcessedAt` integer;