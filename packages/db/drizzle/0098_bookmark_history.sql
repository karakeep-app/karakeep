CREATE TABLE `bookmarkHistory` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`ownerId` text NOT NULL,
	`actorId` text,
	`createdAt` integer NOT NULL,
	`type` text NOT NULL,
	`title` text,
	`changes` text NOT NULL,
	FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `history_bookmark_page` ON `bookmarkHistory` (`ownerId`,`bookmarkId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `history_deleted_page` ON `bookmarkHistory` (`ownerId`,`type`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `history_expiry` ON `bookmarkHistory` (`createdAt`);