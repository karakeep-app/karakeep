ALTER TABLE `bookmarks` ADD `lastIndexedAt` integer;--> statement-breakpoint

-- Backfill lastIndexedAt for existing bookmarks with their creation time
-- This assumes existing bookmarks were indexed around when they were created
UPDATE `bookmarks` SET `lastIndexedAt` = `createdAt` WHERE `lastIndexedAt` IS NULL;
