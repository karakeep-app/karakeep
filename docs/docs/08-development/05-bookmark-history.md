# Bookmark change history

The owner can expand **Change history** in a bookmark's details. Deleted items are listed under **Settings → Change history**. Events expire 90 days after they occur; deletion does not restart that window for older edits. This feature records changes from deployment onward and cannot restore deleted files.

## Storage and access

`bookmarkHistory` stores grouped old/new field values, actor identity/kind, timestamps, and the retained bookmark ID. The bookmark ID deliberately has no cascading foreign key. Account deletion removes the owner's history; deleting an actor anonymizes that actor reference without deleting other users' history.

`bookmarks.getHistory` and `bookmarks.getDeletedHistory` are owner-only tRPC queries with bookmark-read API-key scope checks. Both use keyset pagination and filter expired events at read time. Neither collaborator nor public-list access grants history access.

Changes and history writes share an immediate SQLite transaction. Queues and file cleanup remain outside the transaction. Only meaningful differences are recorded; bookkeeping timestamps are omitted. Relationship snapshots retain names after a tag or list is removed.

## Coverage

Captured: explicit field edits, standalone text and personal notes, existing-URL re-saves, tag attachment/rename/merge/deletion, manual list membership/rename/merge/deletion, membership removal, attachment changes and moves, and bookmark deletion. Relationship removals caused by account deletion are retained for surviving bookmark owners.

Excluded: automatic crawling, AI, rules, preprocessing, processing statuses, highlight history, reading progress, and computed smart-list membership. Existing export formats do not include history. This is application history, not a tamper-resistant audit log.

The maintenance worker enqueues expiry cleanup on startup and daily at 03:00 UTC. Cleanup deletes in batches of 500 and yields through a continuation job after two minutes. With the maintenance worker disabled, expired events remain hidden but physical cleanup waits until the worker runs again.

## Implementation entry points

- `packages/trpc/lib/bookmarkHistory.ts`: allowlisted snapshots and transactional change capture.
- `packages/trpc/routers/bookmarkHistory.ts`: authorized pagination and expiry filtering.
- `apps/web/components/dashboard/preview/BookmarkHistory.tsx`: shared history presentation.
- Migrations `0098_bookmark_history` and `0099_history_actor_kind` must be applied before serving the new code.

Focused tests cover field diffs, no-op updates, text clearing, rollback, retained deletion, expiry, pagination, relationship lifecycle, collaborator denial, and rendering previous/new values. Browser verification requires an available browser connection.
