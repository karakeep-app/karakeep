DROP INDEX `bookmarks_userId_archived_createdAt_id_idx`;--> statement-breakpoint
DROP INDEX `bookmarks_userId_favourited_createdAt_id_idx`;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `lastSavedAt` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `bookmarks` SET `lastSavedAt` = `createdAt`;--> statement-breakpoint
CREATE INDEX `bookmarks_userId_lastSavedAt_id_idx` ON `bookmarks` (`userId`,`lastSavedAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_archived_lastSavedAt_id_idx` ON `bookmarks` (`userId`,`archived`,`lastSavedAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_favourited_lastSavedAt_id_idx` ON `bookmarks` (`userId`,`favourited`,`lastSavedAt`,`id`);
