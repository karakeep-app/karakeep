DROP INDEX IF EXISTS `tagsOnBookmarks_tagId_idx`;--> statement-breakpoint
CREATE INDEX `tagsOnBookmarks_tagId_idx` ON `tagsOnBookmarks` (`tagId`);