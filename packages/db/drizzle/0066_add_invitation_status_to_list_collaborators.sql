ALTER TABLE `listCollaborators` ADD `status` text DEFAULT 'accepted' NOT NULL;--> statement-breakpoint
ALTER TABLE `listCollaborators` ADD `invitedAt` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `listCollaborators` ADD `invitedEmail` text;--> statement-breakpoint
CREATE INDEX `listCollaborators_status_idx` ON `listCollaborators` (`status`);
