CREATE TABLE `chatMessages` (
	`id` text PRIMARY KEY NOT NULL,
	`chatId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`chatId`) REFERENCES `chatSessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chatMessages_chatId_idx` ON `chatMessages` (`chatId`);--> statement-breakpoint
CREATE INDEX `chatMessages_chatId_createdAt_idx` ON `chatMessages` (`chatId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `chatSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chatSessions_userId_idx` ON `chatSessions` (`userId`);--> statement-breakpoint
CREATE INDEX `chatSessions_userId_modifiedAt_idx` ON `chatSessions` (`userId`,`modifiedAt`);