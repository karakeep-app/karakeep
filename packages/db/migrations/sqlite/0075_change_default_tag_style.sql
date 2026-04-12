-- Change default for tagStyle from 'lowercase-hyphens' to 'titlecase-spaces'
-- Using rename/add/drop pattern to avoid DROP TABLE which triggers cascade deletes
ALTER TABLE `user` RENAME COLUMN `tagStyle` TO `tagStyle_old`;--> statement-breakpoint
ALTER TABLE `user` ADD COLUMN `tagStyle` text DEFAULT 'titlecase-spaces';--> statement-breakpoint
UPDATE `user` SET `tagStyle` = `tagStyle_old`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `tagStyle_old`;
