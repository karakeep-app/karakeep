CREATE TABLE `userReadingProgress` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`readingProgressOffset` integer NOT NULL,
	`readingProgressAnchor` text,
	`readingProgressPercent` integer,
	`modifiedAt` integer,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `userReadingProgress_bookmarkId_idx` ON `userReadingProgress` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `userReadingProgress_userId_idx` ON `userReadingProgress` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `userReadingProgress_bookmarkId_userId_unique` ON `userReadingProgress` (`bookmarkId`,`userId`);