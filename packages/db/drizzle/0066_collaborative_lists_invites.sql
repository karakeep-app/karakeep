CREATE TABLE `listInvitations` (
	`id` text PRIMARY KEY NOT NULL,
	`listId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`invitedAt` integer NOT NULL,
	`invitedEmail` text,
	`invitedBy` text,
	FOREIGN KEY (`listId`) REFERENCES `bookmarkLists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invitedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `listInvitations_listId_idx` ON `listInvitations` (`listId`);--> statement-breakpoint
CREATE INDEX `listInvitations_userId_idx` ON `listInvitations` (`userId`);--> statement-breakpoint
CREATE INDEX `listInvitations_status_idx` ON `listInvitations` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `listInvitations_listId_userId_unique` ON `listInvitations` (`listId`,`userId`);