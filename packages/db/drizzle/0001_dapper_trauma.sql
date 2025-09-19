CREATE TABLE `bookmarkTexts` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text,
	FOREIGN KEY (`id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
