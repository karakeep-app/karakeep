DROP TABLE `verificationToken`;--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`modifiedAt` integer
);
