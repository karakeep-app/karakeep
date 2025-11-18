ALTER TABLE `bookmarkLists` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarkLists_slug_idx` ON `bookmarkLists` (`slug`);