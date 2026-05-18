ALTER TABLE bookmarkLinks ADD `crawlStatus` text DEFAULT 'pending';--> statement-breakpoint
UPDATE bookmarkLinks SET crawlStatus = 'failure' where htmlContent is null;--> statement-breakpoint
UPDATE bookmarkLinks SET crawlStatus = 'success' where htmlContent is not null;