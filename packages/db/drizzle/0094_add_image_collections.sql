CREATE TABLE `imageCollectionItems` (
	`id` text PRIMARY KEY NOT NULL,
	`collectionId` text NOT NULL,
	`position` integer NOT NULL,
	`bookmarkId` text NOT NULL,
	`addedAt` integer NOT NULL,
	FOREIGN KEY (`collectionId`) REFERENCES `imageCollections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `imageCollectionItems_collectionId_position_idx` ON `imageCollectionItems` (`collectionId`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `imageCollectionItems_bookmarkId_unique` ON `imageCollectionItems` (`bookmarkId`);--> statement-breakpoint
CREATE TABLE `imageCollections` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
