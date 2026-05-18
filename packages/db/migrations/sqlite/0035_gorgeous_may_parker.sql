CREATE TABLE `highlights` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`startOffset` integer NOT NULL,
	`endOffset` integer NOT NULL,
	`color` text DEFAULT 'yellow' NOT NULL,
	`note` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `highlights_bookmarkId_idx` ON `highlights` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `highlights_userId_idx` ON `highlights` (`userId`);