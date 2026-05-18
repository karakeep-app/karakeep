UPDATE bookmarks
SET
  taggingStatus = CASE
    WHEN taggingStatus = 'pending' THEN NULL
    ELSE taggingStatus
  END,
  summarizationStatus = CASE
    WHEN summarizationStatus = 'pending' THEN NULL
    ELSE summarizationStatus
  END
WHERE id IN (
  SELECT id
  FROM bookmarkLinks
  WHERE crawlStatus = 'failure'
);
