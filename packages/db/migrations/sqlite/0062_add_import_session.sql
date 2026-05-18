CREATE TABLE `importSessionBookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`importSessionId` text NOT NULL,
	`bookmarkId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`importSessionId`) REFERENCES `importSessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `importSessionBookmarks_sessionId_idx` ON `importSessionBookmarks` (`importSessionId`);--> statement-breakpoint
CREATE INDEX `importSessionBookmarks_bookmarkId_idx` ON `importSessionBookmarks` (`bookmarkId`);--> statement-breakpoint
CREATE UNIQUE INDEX `importSessionBookmarks_importSessionId_bookmarkId_unique` ON `importSessionBookmarks` (`importSessionId`,`bookmarkId`);--> statement-breakpoint
CREATE TABLE `importSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`userId` text NOT NULL,
	`message` text,
	`rootListId` text,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rootListId`) REFERENCES `bookmarkLists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `importSessions_userId_idx` ON `importSessions` (`userId`);