CREATE TABLE `adapterExtractionLog` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmarkId` text NOT NULL,
	`adapter` text NOT NULL,
	`version` text NOT NULL,
	`latencyMs` integer NOT NULL,
	`ok` integer NOT NULL,
	`error` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`bookmarkId`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `adapterExtractionLog_bookmarkId_idx` ON `adapterExtractionLog` (`bookmarkId`);--> statement-breakpoint
CREATE INDEX `adapterExtractionLog_adapter_createdAt_idx` ON `adapterExtractionLog` (`adapter`,`createdAt`);--> statement-breakpoint
ALTER TABLE `bookmarkLinks` ADD `platform` text;--> statement-breakpoint
ALTER TABLE `bookmarkLinks` ADD `rawExtraction` text;--> statement-breakpoint
ALTER TABLE `bookmarkLinks` ADD `adapterVersion` text;