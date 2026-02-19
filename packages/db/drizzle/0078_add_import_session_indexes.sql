CREATE INDEX `importSessions_status_idx` ON `importSessions` (`status`);--> statement-breakpoint
CREATE INDEX `importStaging_status_idx` ON `importStagingBookmarks` (`status`);--> statement-breakpoint
CREATE INDEX `importStaging_status_processingStartedAt_idx` ON `importStagingBookmarks` (`status`,`processingStartedAt`);