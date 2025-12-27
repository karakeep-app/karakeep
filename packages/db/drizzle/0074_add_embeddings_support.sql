CREATE TABLE `bookmarkEmbeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`userId` text NOT NULL,
	`embedding` blob NOT NULL,
	`embeddingModel` text NOT NULL,
	`vectorDimension` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkEmbeddings_bookmarkId_unique` ON `bookmarkEmbeddings` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarkEmbeddings_bookmarkId_idx` ON `bookmarkEmbeddings` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarkEmbeddings_userId_idx` ON `bookmarkEmbeddings` (`userId`);--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `embeddingStatus` text DEFAULT 'pending';