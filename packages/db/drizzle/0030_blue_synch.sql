ALTER TABLE `assets` ADD `size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `contentType` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `fileName` text;--> statement-breakpoint
INSERT INTO `assets` (`id`, `assetType`, `bookmarkId`, `userId`, `fileName`)
	SELECT
		`bookmarkAssets`.`assetId`,
		'bookmarkAsset',
		`bookmarkAssets`.`id`,
		(SELECT `bookmarks`.`userId` FROM `bookmarks` WHERE `bookmarks`.`id` = `bookmarkAssets`.`id`),
		`bookmarkAssets`.`fileName`
	FROM `bookmarkAssets`;

