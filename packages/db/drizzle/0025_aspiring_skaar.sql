ALTER TABLE bookmarks ADD `type` text NOT NULL DEFAULT "text";--> statement-breakpoint
-- Fill in the bookmark type
UPDATE bookmarks
SET type = CASE
   WHEN EXISTS (SELECT 1 FROM bookmarkLinks WHERE bookmarkLinks.id = bookmarks.id)
       THEN 'link'
   WHEN EXISTS (SELECT 1 FROM bookmarkTexts WHERE bookmarkTexts.id = bookmarks.id)
       THEN 'text'
   WHEN EXISTS (SELECT 1 FROM bookmarkAssets WHERE bookmarkAssets.id = bookmarks.id)
       THEN 'asset'
END;