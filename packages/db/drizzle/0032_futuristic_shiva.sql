CREATE TABLE `rssFeedImports` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`entryId` text NOT NULL,
	`rssFeedId` text NOT NULL,
	`bookmarkId` text,
	FOREIGN KEY (`rssFeedId`) REFERENCES `rssFeeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rssFeeds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastFetchedAt` integer,
	`lastFetchedStatus` text DEFAULT 'pending',
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rssFeedImports_feedIdIdx_idx` ON `rssFeedImports` (`rssFeedId`);--> statement-breakpoint
CREATE INDEX `rssFeedImports_entryIdIdx_idx` ON `rssFeedImports` (`entryId`);--> statement-breakpoint
CREATE UNIQUE INDEX `rssFeedImports_rssFeedId_entryId_unique` ON `rssFeedImports` (`rssFeedId`,`entryId`);--> statement-breakpoint
CREATE INDEX `rssFeeds_userId_idx` ON `rssFeeds` (`userId`);