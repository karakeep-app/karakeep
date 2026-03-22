ALTER TABLE `bookmarks` ADD `lastSavedAt` integer;--> statement-breakpoint
UPDATE `bookmarks` SET `lastSavedAt` = `createdAt` WHERE `lastSavedAt` IS NULL;--> statement-breakpoint
CREATE INDEX `bookmarks_userId_lastSavedAt_id_idx` ON `bookmarks` (`userId`,`lastSavedAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_archived_lastSavedAt_id_idx` ON `bookmarks` (`userId`,`archived`,`lastSavedAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_favourited_lastSavedAt_id_idx` ON `bookmarks` (`userId`,`favourited`,`lastSavedAt`,`id`);
