CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`url` text NOT NULL,
	`userId` text NOT NULL,
	`events` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhooks_userId_idx` ON `webhooks` (`userId`);
