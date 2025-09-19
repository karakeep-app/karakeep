UPDATE `customPrompts` SET `attachedBy` = 'all_tagging' WHERE `attachedBy` = 'all';--> statement-breakpoint
ALTER TABLE `customPrompts` RENAME COLUMN `attachedBy` TO `appliesTo`;
