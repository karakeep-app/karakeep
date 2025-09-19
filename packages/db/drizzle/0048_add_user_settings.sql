CREATE TABLE `userSettings` (
	`userId` text PRIMARY KEY NOT NULL,
	`bookmarkClickAction` text DEFAULT 'open_original_link' NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `userSettings` (`userId`, `bookmarkClickAction`) SELECT `id`, 'open_original_link' FROM `user`;
