ALTER TABLE `user` ADD `bookmarkClickAction` text DEFAULT 'open_original_link' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `archiveDisplayBehaviour` text DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `timezone` text DEFAULT 'UTC';--> statement-breakpoint
UPDATE `user` SET
  `bookmarkClickAction` = (
    SELECT `bookmarkClickAction` FROM `userSettings` WHERE `userSettings`.`userId` = `user`.`id`
  ),
  `archiveDisplayBehaviour` = (
    SELECT `archiveDisplayBehaviour` FROM `userSettings` WHERE `userSettings`.`userId` = `user`.`id`
  ),
  `timezone` = (
    SELECT `timezone` FROM `userSettings` WHERE `userSettings`.`userId` = `user`.`id`
  );--> statement-breakpoint
DROP TABLE `userSettings`;
