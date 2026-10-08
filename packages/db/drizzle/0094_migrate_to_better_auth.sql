CREATE TABLE `__new_account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Foreign keys weren't enforced on older installs, so accounts of users that
-- were deleted back then can still be around. They'd fail the foreign key
-- check of the new table and abort the whole migration.
INSERT INTO `__new_account` (
	`id`,
	`accountId`,
	`providerId`,
	`userId`,
	`accessToken`,
	`refreshToken`,
	`idToken`,
	`accessTokenExpiresAt`,
	`scope`,
	`createdAt`,
	`updatedAt`
)
SELECT
	'legacy-oauth:' || `provider` || ':' || `providerAccountId`,
	`providerAccountId`,
	`provider`,
	`userId`,
	`access_token`,
	`refresh_token`,
	`id_token`,
	CASE WHEN `expires_at` IS NULL THEN NULL ELSE `expires_at` * 1000 END,
	`scope`,
	unixepoch() * 1000,
	unixepoch() * 1000
FROM `account`
WHERE `userId` IN (SELECT `id` FROM `user`);--> statement-breakpoint
-- Passwords move to better-auth's credential accounts. Legacy hashes are
-- bcrypt(password + salt), so the salt is kept alongside the hash.
INSERT INTO `__new_account` (
	`id`,
	`accountId`,
	`providerId`,
	`userId`,
	`password`,
	`createdAt`,
	`updatedAt`
)
SELECT
	'legacy-credential:' || `id`,
	`id`,
	'credential',
	`id`,
	CASE
		WHEN `salt` = '' THEN `password`
		ELSE 'bcrypt-salted:' || `salt` || ':' || `password`
	END,
	unixepoch() * 1000,
	unixepoch() * 1000
FROM `user`
WHERE `password` IS NOT NULL;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
CREATE INDEX `accounts_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_providerId_accountId_unique` ON `account` (`providerId`,`accountId`);--> statement-breakpoint
DROP TABLE `verificationToken`;--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verificationTokens_identifier_idx` ON `verificationToken` (`identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `verificationTokens_identifier_value_unique` ON `verificationToken` (`identifier`,`value`);--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_userId_idx` ON `session` (`userId`);--> statement-breakpoint
DROP TABLE `passwordResetToken`;--> statement-breakpoint
ALTER TABLE `user` ADD `createdAt` integer;--> statement-breakpoint
ALTER TABLE `user` ADD `updatedAt` integer;--> statement-breakpoint
-- emailVerified changes from a timestamp to a boolean.
UPDATE `user`
SET
	`emailVerified` = (`emailVerified` IS NOT NULL),
	`createdAt` = unixepoch() * 1000,
	`updatedAt` = unixepoch() * 1000;--> statement-breakpoint
-- better-auth looks users up by lowercased email. Emails that would collide
-- with another user once lowercased are left untouched.
UPDATE `user`
SET `email` = lower(`email`)
WHERE `email` != lower(`email`)
	AND NOT EXISTS (
		SELECT 1 FROM `user` AS `other`
		WHERE lower(`other`.`email`) = lower(`user`.`email`)
			AND `other`.`id` != `user`.`id`
	);--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `password`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `salt`;
