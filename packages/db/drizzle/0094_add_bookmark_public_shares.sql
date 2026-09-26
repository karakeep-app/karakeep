CREATE TABLE `bookmarkPublicShares` (
	`bookmarkId` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkPublicShares_token_unique` ON `bookmarkPublicShares` (`token`);