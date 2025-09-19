CREATE TABLE `bookmarkAssets2` (
	`id` text PRIMARY KEY NOT NULL,
	`assetType` text NOT NULL,
	`assetId` text NOT NULL,
	FOREIGN KEY (`id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
DROP TABLE `bookmarkAssets`;