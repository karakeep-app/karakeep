CREATE TABLE `bookmarkLists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`createdAt` integer NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bookmarksInLists` (
	`bookmarkId` text NOT NULL,
	`listId` text NOT NULL,
	`addedAt` integer,
	PRIMARY KEY(`bookmarkId`, `listId`),
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listId`) REFERENCES `bookmarkLists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkLists_name_userId_unique` ON `bookmarkLists` (`name`,`userId`);