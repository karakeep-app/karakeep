CREATE TABLE `githubStarsAuthorizations` (
	`userId` text PRIMARY KEY NOT NULL,
	`stateHash` text NOT NULL,
	`verifier` text NOT NULL,
	`expiresAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `githubStarsConnections` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`login` text NOT NULL,
	`credentials` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `githubStarsConnections_userId_unique` ON `githubStarsConnections` (`userId`);--> statement-breakpoint
ALTER TABLE `githubStarsSubscriptions` ADD `connectionId` text REFERENCES githubStarsConnections(id) ON DELETE cascade;