DROP INDEX `bookmarks_archived_idx`;--> statement-breakpoint
DROP INDEX `bookmarks_favourited_idx`;--> statement-breakpoint
CREATE INDEX `bookmarks_userId_createdAt_id_idx` ON `bookmarks` (`userId`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_archived_createdAt_id_idx` ON `bookmarks` (`userId`,`archived`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_favourited_createdAt_id_idx` ON `bookmarks` (`userId`,`favourited`,`createdAt`,`id`);--> statement-breakpoint
CREATE INDEX `bookmarksInLists_listId_bookmarkId_idx` ON `bookmarksInLists` (`listId`,`bookmarkId`);--> statement-breakpoint
CREATE INDEX `rssFeedImports_rssFeedId_bookmarkId_idx` ON `rssFeedImports` (`rssFeedId`,`bookmarkId`);--> statement-breakpoint
CREATE INDEX `tagsOnBookmarks_tagId_bookmarkId_idx` ON `tagsOnBookmarks` (`tagId`,`bookmarkId`);