ALTER TABLE `bookmarks` ADD `deleteAt` integer;--> statement-breakpoint
CREATE INDEX `bookmarks_deleteAt_idx` ON `bookmarks` (`deleteAt`);