CREATE TABLE `listCollaborators` (
	`id` text PRIMARY KEY NOT NULL,
	`listId` text NOT NULL,
	`userId` text NOT NULL,
	`role` text NOT NULL,
	`createdAt` integer NOT NULL,
	`addedBy` text NOT NULL,
	FOREIGN KEY (`listId`) REFERENCES `bookmarkLists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `listCollaborators_listId_idx` ON `listCollaborators` (`listId`);--> statement-breakpoint
CREATE INDEX `listCollaborators_userId_idx` ON `listCollaborators` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `listCollaborators_listId_userId_unique` ON `listCollaborators` (`listId`,`userId`);--> statement-breakpoint
ALTER TABLE `bookmarksInLists` ADD `addedBy` text REFERENCES user(id);