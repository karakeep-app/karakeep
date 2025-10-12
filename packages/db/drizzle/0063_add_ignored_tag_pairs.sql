CREATE TABLE `ignoredTagPairs` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`tagId1` text NOT NULL,
	`tagId2` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId1`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tagId2`) REFERENCES `bookmarkTags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ignoredTagPairs_userId_idx` ON `ignoredTagPairs` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `ignoredTagPairs_userId_tagId1_tagId2_unique` ON `ignoredTagPairs` (`userId`,`tagId1`,`tagId2`);
