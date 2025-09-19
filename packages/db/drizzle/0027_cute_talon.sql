CREATE TABLE `customPrompts` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`enabled` integer NOT NULL,
	`attachedBy` text NOT NULL,
	`createdAt` integer NOT NULL,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customPrompts_userId_idx` ON `customPrompts` (`userId`);