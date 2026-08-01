ALTER TABLE `importSessions` ADD `completedAt` integer;--> statement-breakpoint
UPDATE `importSessions`
SET `completedAt` = COALESCE(
  (
    SELECT MAX(`completedAt`)
    FROM `importStagingBookmarks`
    WHERE `importSessionId` = `importSessions`.`id`
  ),
  `modifiedAt`,
  `createdAt`
)
WHERE `status` = 'completed';--> statement-breakpoint
ALTER TABLE `importSessions` ADD `totalBookmarks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `importSessions` ADD `completedBookmarks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `importSessions` ADD `failedBookmarks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `importSessions` ADD `pendingBookmarks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `importSessions` ADD `processingBookmarks` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `importSessions_status_completedAt_idx` ON `importSessions` (`status`,`completedAt`);
