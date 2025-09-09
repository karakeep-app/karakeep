ALTER TABLE `user` ADD `bookmarkClickAction` text DEFAULT 'open_original_link' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `archiveDisplayBehaviour` text DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `timezone` text DEFAULT 'UTC';--> statement-breakpoint
UPDATE `user` SET
  `bookmarkClickAction` = coalesce((
    SELECT `bookmarkClickAction` FROM `userSettings` WHERE `userSettings`.`userId` = `user`.`id`
  ), 'open_original_link'),
  `archiveDisplayBehaviour` = coalesce((
    SELECT `archiveDisplayBehaviour` FROM `userSettings` WHERE `userSettings`.`userId` = `user`.`id`
  ), 'show'),
  `timezone` = coalesce((
    SELECT `timezone` FROM `userSettings` WHERE `userSettings`.`userId` = `user`.`id`
  ), 'UTC');--> statement-breakpoint
DROP TABLE `userSettings`;
