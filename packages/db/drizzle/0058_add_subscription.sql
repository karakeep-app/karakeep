CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`stripeCustomerId` text NOT NULL,
	`stripeSubscriptionId` text,
	`status` text NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`priceId` text,
	`cancelAtPeriodEnd` integer DEFAULT false,
	`startDate` integer,
	`endDate` integer,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_userId_unique` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `subscriptions_userId_idx` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `subscriptions_stripeCustomerId_idx` ON `subscriptions` (`stripeCustomerId`);