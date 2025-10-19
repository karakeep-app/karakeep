DROP TABLE `passwordResetToken`;--> statement-breakpoint


PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`id_token` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	PRIMARY KEY(`type`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_account`("userId", "type", "providerAccountId", "refresh_token", "access_token", "expires_at", "scope", "id_token", "createdAt", "modifiedAt") SELECT "userId", "type", "providerAccountId", "refresh_token", "access_token", "expires_at", "scope", "id_token", unixepoch() * 1000, NULL FROM `account`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint


-- The session table wasn't used before, let's drop it and create a new one
DROP TABLE `session`;--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`sessionToken` text NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	`ipAddress` text,
	`userAgent` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_sessionToken_unique` ON `session` (`sessionToken`);--> statement-breakpoint


PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
INSERT INTO `__new_verificationToken`("identifier", "token", "expires", "createdAt", "modifiedAt")
SELECT "identifier", "token", "expires", unixepoch() * 1000, NULL FROM `verificationToken`;--> statement-breakpoint
DROP TABLE `verificationToken`;--> statement-breakpoint
ALTER TABLE `__new_verificationToken` RENAME TO `verificationToken`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint

-- Backfill credential accounts for existing users so Better Auth can use it
INSERT INTO account ("userId", "type", "providerAccountId", "password", "createdAt")
SELECT
    u."id",
    'credential',
    u."id",
    json_object('v', 1, 'hash', u."password", 'salt', COALESCE(u."salt", '')),
	unixepoch() * 1000
FROM "user" AS u
LEFT JOIN account AS a
    ON a."userId" = u."id" AND a."type" = 'credential'
WHERE
    u."password" IS NOT NULL
    AND u."password" != ''
    AND a."userId" IS NULL;--> statement-breakpoint

-- Now drop the legacy password column
ALTER TABLE `user` DROP COLUMN `password`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `salt`;
