CREATE TABLE `inAppSubscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`store` text,
	`productId` text,
	`status` text NOT NULL,
	`cancelAtPeriodEnd` integer DEFAULT false NOT NULL,
	`billingIssue` integer DEFAULT false NOT NULL,
	`isSandbox` integer DEFAULT false NOT NULL,
	`startDate` integer,
	`endDate` integer,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inAppSubscriptions_userId_unique` ON `inAppSubscriptions` (`userId`);