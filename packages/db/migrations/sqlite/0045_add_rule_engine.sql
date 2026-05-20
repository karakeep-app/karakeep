CREATE TABLE `ruleEngineActions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`ruleId` text NOT NULL,
	`action` text NOT NULL,
	`listId` text,
	`tagId` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ruleId`) REFERENCES `ruleEngineRules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`tagId`) REFERENCES `bookmarkTags`(`userId`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`listId`) REFERENCES `bookmarkLists`(`userId`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ruleEngineActions_userId_idx` ON `ruleEngineActions` (`userId`);--> statement-breakpoint
CREATE INDEX `ruleEngineActions_ruleId_idx` ON `ruleEngineActions` (`ruleId`);--> statement-breakpoint
CREATE TABLE `ruleEngineRules` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`event` text NOT NULL,
	`condition` text NOT NULL,
	`userId` text NOT NULL,
	`listId` text,
	`tagId` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`tagId`) REFERENCES `bookmarkTags`(`userId`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`listId`) REFERENCES `bookmarkLists`(`userId`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ruleEngine_userId_idx` ON `ruleEngineRules` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkLists_userId_id_idx` ON `bookmarkLists` (`userId`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkTags_userId_id_idx` ON `bookmarkTags` (`userId`,`id`);