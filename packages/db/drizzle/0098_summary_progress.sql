ALTER TABLE `summaryProcessing` ADD `stage` text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE `summaryProcessing` ADD `notebookErrorCode` text;--> statement-breakpoint
ALTER TABLE `summaryProcessing` ADD `hermesErrorCode` text;--> statement-breakpoint
ALTER TABLE `summaryProcessing` ADD `retryCount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `summaryProcessing` ADD `nextRetryAt` integer;--> statement-breakpoint
ALTER TABLE `summaryProcessing` ADD `startedAt` integer;--> statement-breakpoint
UPDATE `summaryProcessing` SET `stage` = `status` WHERE `status` IN ('success', 'failure');
