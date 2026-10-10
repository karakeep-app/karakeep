CREATE UNIQUE INDEX `webhooks_userId_id_idx` ON `webhooks` (`userId`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ruleEngineActions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`ruleId` text NOT NULL,
	`action` text NOT NULL,
	`listId` text,
	`tagId` text,
	`webhookId` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ruleId`) REFERENCES `ruleEngineRules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`tagId`) REFERENCES `bookmarkTags`(`userId`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`listId`) REFERENCES `bookmarkLists`(`userId`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`webhookId`) REFERENCES `webhooks`(`userId`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ruleEngineActions`("id", "userId", "ruleId", "action", "listId", "tagId") SELECT "id", "userId", "ruleId", "action", "listId", "tagId" FROM `ruleEngineActions`;--> statement-breakpoint
DROP TABLE `ruleEngineActions`;--> statement-breakpoint
ALTER TABLE `__new_ruleEngineActions` RENAME TO `ruleEngineActions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ruleEngineActions_userId_idx` ON `ruleEngineActions` (`userId`);--> statement-breakpoint
CREATE INDEX `ruleEngineActions_ruleId_idx` ON `ruleEngineActions` (`ruleId`);