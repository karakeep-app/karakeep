PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer,
	`image` text,
	`password` text,
	`salt` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'user',
	`bookmarkQuota` integer,
	`storageQuota` integer,
	`browserCrawlingEnabled` integer,
	`bookmarkClickAction` text DEFAULT 'open_original_link' NOT NULL,
	`archiveDisplayBehaviour` text DEFAULT 'show' NOT NULL,
	`timezone` text DEFAULT 'UTC',
	`backupsEnabled` integer DEFAULT false NOT NULL,
	`backupsFrequency` text DEFAULT 'weekly' NOT NULL,
	`backupsRetentionDays` integer DEFAULT 30 NOT NULL,
	`readerFontSize` integer,
	`readerLineHeight` real,
	`readerFontFamily` text,
	`autoTaggingEnabled` integer,
	`autoSummarizationEnabled` integer,
	`tagStyle` text DEFAULT 'as-generated',
	`inferredTagLang` text
);
--> statement-breakpoint
INSERT INTO `__new_user`("id", "name", "email", "emailVerified", "image", "password", "salt", "role", "bookmarkQuota", "storageQuota", "browserCrawlingEnabled", "bookmarkClickAction", "archiveDisplayBehaviour", "timezone", "backupsEnabled", "backupsFrequency", "backupsRetentionDays", "readerFontSize", "readerLineHeight", "readerFontFamily", "autoTaggingEnabled", "autoSummarizationEnabled", "tagStyle", "inferredTagLang") SELECT "id", "name", "email", "emailVerified", "image", "password", "salt", "role", "bookmarkQuota", "storageQuota", "browserCrawlingEnabled", "bookmarkClickAction", "archiveDisplayBehaviour", "timezone", "backupsEnabled", "backupsFrequency", "backupsRetentionDays", "readerFontSize", "readerLineHeight", "readerFontFamily", "autoTaggingEnabled", "autoSummarizationEnabled", "tagStyle", "inferredTagLang" FROM `user`;--> statement-breakpoint
DROP TABLE `user`;--> statement-breakpoint
ALTER TABLE `__new_user` RENAME TO `user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);