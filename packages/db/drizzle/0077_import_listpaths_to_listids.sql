CREATE TABLE `importStagingBookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`importSessionId` text NOT NULL,
	`type` text NOT NULL,
	`url` text,
	`title` text,
	`content` text,
	`note` text,
	`tags` text,
	`listIds` text,
	`sourceAddedAt` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`processingStartedAt` integer,
	`result` text,
	`resultReason` text,
	`resultBookmarkId` text,
	`createdAt` integer NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`importSessionId`) REFERENCES `importSessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resultBookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `importStaging_session_status_idx` ON `importStagingBookmarks` (`importSessionId`,`status`);--> statement-breakpoint
CREATE INDEX `importStaging_completedAt_idx` ON `importStagingBookmarks` (`completedAt`);--> statement-breakpoint
ALTER TABLE `importSessions` ADD `status` text DEFAULT 'staging' NOT NULL;--> statement-breakpoint
ALTER TABLE `importSessions` ADD `lastProcessedAt` integer;--> statement-breakpoint
-- Migrate legacy importSessionBookmarks into importStagingBookmarks.
-- Reuses the same ID from the old table.
-- Calculates status based on actual downstream crawl/tagging state.
INSERT INTO importStagingBookmarks (
  id, importSessionId, type, url,
  status, processingStartedAt, result, resultBookmarkId, createdAt, completedAt
)
SELECT
  isb.id,
  isb.importSessionId,
  b.type,
  bl.url,
  CASE
    WHEN (bl.crawlStatus IS NULL OR bl.crawlStatus IN ('success', 'failure'))
     AND (b.taggingStatus IS NULL OR b.taggingStatus IN ('success', 'failure'))
    THEN 'completed'
    ELSE 'processing'
  END,
  isb.createdAt,
  'accepted',
  isb.bookmarkId,
  isb.createdAt,
  CASE
    WHEN (bl.crawlStatus IS NULL OR bl.crawlStatus IN ('success', 'failure'))
     AND (b.taggingStatus IS NULL OR b.taggingStatus IN ('success', 'failure'))
    THEN isb.createdAt
    ELSE NULL
  END
FROM importSessionBookmarks isb
JOIN bookmarks b ON b.id = isb.bookmarkId
LEFT JOIN bookmarkLinks bl ON bl.id = isb.bookmarkId
WHERE NOT EXISTS (
  SELECT 1 FROM importStagingBookmarks stg
  WHERE stg.importSessionId = isb.importSessionId
);
--> statement-breakpoint
-- Move legacy sessions out of staging:
-- - Running if any items are still processing downstream
-- - Completed otherwise (including sessions with no remaining items)
UPDATE importSessions
SET status = CASE
  WHEN EXISTS (
    SELECT 1
    FROM importStagingBookmarks stg
    WHERE stg.importSessionId = importSessions.id
      AND stg.status = 'processing'
  )
  THEN 'running'
  ELSE 'completed'
END
WHERE status = 'staging';
