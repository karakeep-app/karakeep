ALTER TABLE `listCollaborators` ADD `status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `listCollaborators` ADD `invitedAt` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `listCollaborators` ADD `invitedEmail` text;--> statement-breakpoint
CREATE INDEX `listCollaborators_status_idx` ON `listCollaborators` (`status`);