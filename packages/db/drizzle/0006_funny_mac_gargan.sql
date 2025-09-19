ALTER TABLE bookmarks ADD `taggingStatus` text DEFAULT 'pending';
--> statement-breakpoint
UPDATE bookmarks SET taggingStatus = 'success';
