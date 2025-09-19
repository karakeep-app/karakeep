CREATE INDEX `bookmarkLists_userId_idx` ON `bookmarkLists` (`userId`);--> statement-breakpoint
CREATE INDEX `bookmarkTags_name_idx` ON `bookmarkTags` (`name`);--> statement-breakpoint
CREATE INDEX `bookmarkTags_userId_idx` ON `bookmarkTags` (`userId`);--> statement-breakpoint
CREATE INDEX `bookmarks_userId_idx` ON `bookmarks` (`userId`);--> statement-breakpoint
CREATE INDEX `bookmarks_archived_idx` ON `bookmarks` (`archived`);--> statement-breakpoint
CREATE INDEX `bookmarks_favourited_idx` ON `bookmarks` (`favourited`);--> statement-breakpoint
CREATE INDEX `bookmarksInLists_bookmarkId_idx` ON `bookmarksInLists` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `bookmarksInLists_listId_idx` ON `bookmarksInLists` (`listId`);--> statement-breakpoint
CREATE INDEX `tagsOnBookmarks_tagId_idx` ON `tagsOnBookmarks` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `tagsOnBookmarks_bookmarkId_idx` ON `tagsOnBookmarks` (`bookmarkId`);