CREATE TABLE `crawlSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`userId` text,
	`startedAt` integer NOT NULL,
	`endedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `bookmarkLinks` ADD `sessionId` text REFERENCES crawlSessions(id);