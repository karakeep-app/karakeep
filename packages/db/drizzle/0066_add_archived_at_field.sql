ALTER TABLE `bookmarks` ADD `archivedAt` integer;--> statement-breakpoint
CREATE INDEX `bookmarks_archivedAt_idx` ON `bookmarks` (`archivedAt`);