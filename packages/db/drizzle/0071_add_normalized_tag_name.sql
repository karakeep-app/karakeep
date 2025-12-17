-- Add normalizedName column to bookmarkTags table
ALTER TABLE `bookmarkTags` ADD `normalizedName` text DEFAULT '' NOT NULL;

-- Populate normalizedName for all existing tags
UPDATE `bookmarkTags` SET `normalizedName` = lower(replace(replace(replace(`name`, ' ', ''), '-', ''), '_', ''));

-- Create index on userId and normalizedName for fast lookups
CREATE INDEX `bookmarkTags_userId_normalizedName_idx` ON `bookmarkTags` (`userId`, `normalizedName`);
