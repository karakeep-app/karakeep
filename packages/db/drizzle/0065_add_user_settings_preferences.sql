ALTER TABLE `user` ADD `inferenceLanguage` text DEFAULT 'english' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `captureScreenshots` integer DEFAULT true NOT NULL;