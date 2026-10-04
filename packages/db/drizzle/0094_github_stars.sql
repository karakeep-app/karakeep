CREATE TABLE `githubStarsSubscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`username` text NOT NULL,
	`listId` text NOT NULL,
	`recurring` integer DEFAULT true NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`importTopics` integer DEFAULT false NOT NULL,
	`nextPage` integer DEFAULT 1 NOT NULL,
	`nextRunAt` integer NOT NULL,
	`leaseUntil` integer,
	`rateLimitUntil` integer,
	`lastSuccessfulSyncAt` integer,
	`lastError` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listId`) REFERENCES `bookmarkLists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `githubStarsSubscriptions_userId_unique` ON `githubStarsSubscriptions` (`userId`);