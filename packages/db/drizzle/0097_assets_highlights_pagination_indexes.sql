DROP INDEX `assets_userId_idx`;--> statement-breakpoint
CREATE INDEX `assets_userId_size_idx` ON `assets` (`userId`,`size`);--> statement-breakpoint
DROP INDEX `highlights_userId_idx`;--> statement-breakpoint
CREATE INDEX `highlights_userId_createdAt_id_idx` ON `highlights` (`userId`,`createdAt`,`id`);