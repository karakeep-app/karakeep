DELETE FROM ruleEngineRules 
WHERE CASE
    WHEN json_valid("event") THEN json_extract("event", '$.type')
  END
IN ('addedToList', 'removedFromList') 
AND (
    CASE
      WHEN json_valid("event") THEN json_extract("event", '$.listId')
    END IS NULL
    OR CASE
      WHEN json_valid("event") THEN json_extract("event", '$.listId')
    END = ''
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TEMPORARY TABLE `_backup_ruleEngineActions` AS 
SELECT * FROM `ruleEngineActions`;
--> statement-breakpoint
CREATE TABLE `__new_ruleEngineRules` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`event` text NOT NULL,
	`condition` text NOT NULL,
	`userId` text NOT NULL,
	`tagId` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`,`tagId`) REFERENCES `bookmarkTags`(`userId`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ruleEngineRules`("id", "enabled", "name", "description", "event", "condition", "userId", "tagId") SELECT "id", "enabled", "name", "description",
CASE 
    WHEN json_valid("event") THEN
      CASE 
        WHEN json_extract("event", '$.type') IN ('addedToList', 'removedFromList')
        THEN json_set(
          json_remove("event", '$.listId'),
          '$.listIds',
          json_array(json_extract("event", '$.listId'))
        )
        ELSE "event"
      END
    ELSE "event"
  END, "condition", "userId", "tagId" FROM `ruleEngineRules`;--> statement-breakpoint
DROP TABLE `ruleEngineRules`;--> statement-breakpoint
ALTER TABLE `__new_ruleEngineRules` RENAME TO `ruleEngineRules`;--> statement-breakpoint
DELETE FROM `ruleEngineActions`;--> statement-breakpoint
INSERT INTO `ruleEngineActions` SELECT * FROM `_backup_ruleEngineActions`;
--> statement-breakpoint
DROP TABLE `_backup_ruleEngineActions`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ruleEngine_userId_idx` ON `ruleEngineRules` (`userId`);
