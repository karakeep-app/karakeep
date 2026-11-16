CREATE TABLE `bookmarkEditHistory` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`field` text NOT NULL,
	`oldValue` text,
	`newValue` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarkEditHistory_bookmarkId_createdAt_idx` ON `bookmarkEditHistory` (`bookmarkId`,`createdAt`);