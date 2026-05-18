CREATE TABLE `bookmarkAssets` (
	`id` text PRIMARY KEY NOT NULL,
	`assetType` text NOT NULL,
	`assetId` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
