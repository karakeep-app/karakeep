-- Add scopes column with default so existing rows backfill to full access.
-- Matches SQLite migration 0083_add_api_key_scopes.sql.
ALTER TABLE "apiKey" ADD COLUMN "scopes" jsonb DEFAULT '["fullaccess"]'::jsonb NOT NULL;
--> statement-breakpoint

-- Data migration: drop rules with empty/missing listId in addedToList/removedFromList events.
-- Matches the DELETE in SQLite migration 0084_rule_engine_multi_list_support.sql.
DELETE FROM "ruleEngineRules"
WHERE ((event::jsonb)->>'type') IN ('addedToList', 'removedFromList')
  AND (
    ((event::jsonb)->>'listId') IS NULL
    OR ((event::jsonb)->>'listId') = ''
  );
--> statement-breakpoint

-- Data migration: convert single listId in event JSON to a listIds array.
-- Matches the json_set/json_remove transformation in the SQLite migration.
UPDATE "ruleEngineRules"
SET event = (
  jsonb_set(
    (event::jsonb) - 'listId',
    '{listIds}',
    jsonb_build_array((event::jsonb)->>'listId')
  )
)::text
WHERE ((event::jsonb)->>'type') IN ('addedToList', 'removedFromList');
--> statement-breakpoint

-- Drop the now-unused listId column and its FK.
ALTER TABLE "ruleEngineRules" DROP CONSTRAINT "ruleEngineRules_userId_listId_fk";
--> statement-breakpoint
ALTER TABLE "ruleEngineRules" DROP COLUMN "listId";
