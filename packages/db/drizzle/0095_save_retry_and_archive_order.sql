ALTER TABLE `assets` ADD `createdAt` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `clientRequestId` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `clientRequestHash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_userId_clientRequestId_unique` ON `bookmarks` (`userId`,`clientRequestId`);