CREATE TABLE `ttsProviderConfig` (
	`userId` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openai-compatible' NOT NULL,
	`baseUrl` text NOT NULL,
	`apiKey` text,
	`model` text NOT NULL,
	`voice` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `ttsStatus` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `ttsTotalChunks` integer;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `ttsVoice` text;