CREATE TABLE `__new_session` (
  `id` text NOT NULL,
  `sessionToken` text NOT NULL PRIMARY KEY,
  `userId` text NOT NULL,
  `expires` integer NOT NULL,
  `createdAt` integer,
  `updatedAt` integer,
  `ipAddress` text,
  `userAgent` text,
  FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade
);

INSERT INTO `__new_session`(
  `id`,
  `sessionToken`,
  `userId`,
  `expires`,
  `createdAt`,
  `updatedAt`,
  `ipAddress`,
  `userAgent`
)
SELECT
  `sessionToken`,
  `sessionToken`,
  `userId`,
  `expires`,
  `createdAt`,
  `updatedAt`,
  `ipAddress`,
  `userAgent`
FROM `session`;

DROP TABLE `session`;

ALTER TABLE `__new_session` RENAME TO `session`;

CREATE UNIQUE INDEX `session_id_unique` ON `session` (`id`);
