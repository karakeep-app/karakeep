ALTER TABLE `session` ADD `createdAt` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `modifiedAt` integer;--> statement-breakpoint
ALTER TABLE `session` ADD `ipAddress` text;--> statement-breakpoint
ALTER TABLE `session` ADD `userAgent` text;