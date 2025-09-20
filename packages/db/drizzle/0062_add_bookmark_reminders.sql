CREATE TABLE `bookmarkReminders` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`remindAt` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkReminders_bookmarkId_unique` ON `bookmarkReminders` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarkReminders_remindAt_idx` ON `bookmarkReminders` (`remindAt`);--> statement-breakpoint
CREATE INDEX `bookmarkReminders_status_idx` ON `bookmarkReminders` (`status`);