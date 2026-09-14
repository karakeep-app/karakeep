CREATE TABLE `bookmarkClusters` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`label` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer,
	`algoVersion` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarkClusters_userId_idx` ON `bookmarkClusters` (`userId`);--> statement-breakpoint
CREATE TABLE `bookmarksInClusters` (
	`bookmarkId` text NOT NULL,
	`clusterId` text NOT NULL,
	`score` real,
	PRIMARY KEY(`bookmarkId`, `clusterId`),
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`clusterId`) REFERENCES `bookmarkClusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bookmarksInClusters_clusterId_bookmarkId_idx` ON `bookmarksInClusters` (`clusterId`,`bookmarkId`);