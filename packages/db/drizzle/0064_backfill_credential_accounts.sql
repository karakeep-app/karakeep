-- Backfill credential accounts for existing users so Better Auth can reuse
-- the legacy bcrypt + salt password hashes stored on the `user` table.

INSERT INTO account ("userId", "type", "provider", "providerAccountId", "session_state")
SELECT
    u."id",
    'oauth',
    'credential',
    u."id",
    json_object('v', 1, 'hash', u."password", 'salt', COALESCE(u."salt", ''))
FROM "user" AS u
LEFT JOIN account AS a
    ON a."userId" = u."id" AND a."provider" = 'credential'
WHERE
    u."password" IS NOT NULL
    AND u."password" != ''
    AND a."userId" IS NULL;
