CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`contentType` text NOT NULL,
	`encoding` text NOT NULL,
	`blob` blob NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assets_userId_idx` ON `assets` (`userId`);