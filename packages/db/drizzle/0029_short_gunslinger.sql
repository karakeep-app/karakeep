CREATE TABLE `assets_new` (
        `id` text PRIMARY KEY NOT NULL,
        `assetType` text NOT NULL,
        `bookmarkId` text,
		`userId` text NOT NULL,
        FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
        FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `assets_new` (`id`, `assetType`, `bookmarkId`, `userId`) SELECT `id`, `assetType`, `bookmarkId`, (select `bookmarks`.`userId` from `bookmarks` where `bookmarks`.`id` = `assets`.`bookmarkId`) FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `assets_new` RENAME TO `assets`;--> statement-breakpoint
CREATE INDEX `assets_bookmarkId_idx` ON `assets` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `assets_assetType_idx` ON `assets` (`assetType`);--> statement-breakpoint
CREATE INDEX `assets_userId_idx` ON `assets` (`userId`);
