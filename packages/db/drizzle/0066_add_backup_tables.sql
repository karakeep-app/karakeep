CREATE TABLE `backupSettings` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`frequency` text DEFAULT 'weekly' NOT NULL,
	`retentionDays` integer DEFAULT 30 NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backupSettings_userId_unique` ON `backupSettings` (`userId`);--> statement-breakpoint
CREATE INDEX `backupSettings_userId_idx` ON `backupSettings` (`userId`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`assetId` text NOT NULL,
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
CREATE INDEX `backups_createdAt_idx` ON `backups` (`createdAt`);