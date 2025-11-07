CREATE TABLE `passwordResetToken` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `passwordResetToken_token_unique` ON `passwordResetToken` (`token`);--> statement-breakpoint
CREATE INDEX `passwordResetTokens_userId_idx` ON `passwordResetToken` (`userId`);