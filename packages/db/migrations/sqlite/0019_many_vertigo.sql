DROP INDEX IF EXISTS `bookmarkLists_name_userId_unique`;--> statement-breakpoint
ALTER TABLE bookmarkLists ADD `parentId` text REFERENCES bookmarkLists(id) ON DELETE SET NULL;
