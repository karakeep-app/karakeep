ALTER TABLE `user` ADD `tagStyle` text DEFAULT 'lowercase-hyphens';--> statement-breakpoint
ALTER TABLE `user` ADD `inferredTagLang` text;--> statement-breakpoint
UPDATE `user` SET `tagStyle` = 'as-generated';
