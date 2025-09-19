CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`assetType` text NOT NULL,
	`bookmarkId` text NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_bookmarkId_idx` ON `assets` (`bookmarkId`);
--> statement-breakpoint
CREATE INDEX `assets_assetType_idx` ON `assets` (`assetType`);
--> statement-breakpoint
INSERT INTO `assets` (`id`, `assetType`, `bookmarkId`)
SELECT `screenshotAssetId`, 'linkScreenshot', `id`
FROM `bookmarkLinks`
WHERE screenshotAssetId IS NOT NULL;
--> statement-breakpoint
INSERT INTO `assets` (`id`, `assetType`, `bookmarkId`)
SELECT `fullPageArchiveAssetId`, 'linkFullPageArchive', `id`
FROM `bookmarkLinks`
WHERE `fullPageArchiveAssetId` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `assets` (`id`, `assetType`, `bookmarkId`)
SELECT `imageAssetId`, 'linkBannerImage', `id`
FROM `bookmarkLinks`
WHERE `imageAssetId` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `bookmarkLinks` DROP COLUMN `screenshotAssetId`;
--> statement-breakpoint
ALTER TABLE `bookmarkLinks` DROP COLUMN `fullPageArchiveAssetId`;
--> statement-breakpoint
ALTER TABLE `bookmarkLinks` DROP COLUMN `imageAssetId`;
