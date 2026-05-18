CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`assetId` text,
	`createdAt` integer NOT NULL,
	`size` integer NOT NULL,
	`bookmarkCount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`errorMessage` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assetId`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backups_userId_idx` ON `backups` (`userId`);--> statement-breakpoint
CREATE INDEX `backups_createdAt_idx` ON `backups` (`createdAt`);--> statement-breakpoint
ALTER TABLE `user` ADD `backupsEnabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `backupsFrequency` text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `backupsRetentionDays` integer DEFAULT 30 NOT NULL;