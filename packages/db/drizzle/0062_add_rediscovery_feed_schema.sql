CREATE TABLE `discoveryQueue` (
	`userId` text NOT NULL,
	`bookmarkId` text NOT NULL,
	`addedAt` integer NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`userId`, `bookmarkId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `discoveryQueue_userId_idx` ON `discoveryQueue` (`userId`);--> statement-breakpoint
CREATE INDEX `discoveryQueue_position_idx` ON `discoveryQueue` (`userId`,`position`);--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `lastRediscoveredAt` integer;