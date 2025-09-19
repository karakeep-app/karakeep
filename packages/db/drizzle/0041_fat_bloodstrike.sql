ALTER TABLE `bookmarks` ADD `modifiedAt` integer;
--> statement-breakpoint
UPDATE `bookmarks` SET `modifiedAt` = `createdAt`;
