import type Database from "better-sqlite3";

import logger from "@karakeep/shared/logger";

// A bookmark's latest edit stays in a separate SQLite file until the user
// either rolls it back (it's discarded) or makes another edit (it's moved into
// the bookmarkEditHistory table of the main database).
//
// The file is ATTACHed to the main connection, so one transaction covers both
// files: a bookmark update, committing the previous pending edit, and storing
// the new one either all happen or none do. (SQLite only guarantees this
// across files in rollback-journal mode; with DB_WAL_MODE each file is still
// atomic on its own.)
export const PENDING_HISTORY_FILENAME = "pending_history.db";
export const PENDING_HISTORY_SCHEMA = "pending";
export const PENDING_EDITS_TABLE = `${PENDING_HISTORY_SCHEMA}.pendingBookmarkEdits`;

// Whether the pending store could be attached. When it can't (degraded
// read-only mode, or the file can't be opened), edits go straight into the
// main history and rollback is unavailable.
export const pendingHistoryState = { available: false };

export function attachPendingHistoryStore(
  sqlite: Database.Database,
  filename: string,
  opts: { readOnly: boolean; walMode: boolean },
): boolean {
  if (opts.readOnly) {
    logger.info("[db] Read-only mode: pending edit history is disabled");
    pendingHistoryState.available = false;
    return false;
  }
  try {
    sqlite
      .prepare(`ATTACH DATABASE ? AS ${PENDING_HISTORY_SCHEMA}`)
      .run(filename);
    sqlite.pragma(
      `${PENDING_HISTORY_SCHEMA}.journal_mode = ${opts.walMode ? "WAL" : "DELETE"}`,
    );
    // Self-managed schema: this file isn't covered by drizzle migrations.
    // oldValue/newValue are JSON, createdAt is in milliseconds. Every row of
    // one edit shares eventId and createdAt, and a bookmark has at most one
    // pending edit. stored is JSON too: the stored values that undo restores
    // when they differ from the displayed ones (the title, see
    // BookmarkFieldChange in packages/trpc/lib/bookmarkHistory.ts).
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS ${PENDING_EDITS_TABLE} (
        id TEXT PRIMARY KEY NOT NULL,
        eventId TEXT NOT NULL,
        bookmarkId TEXT NOT NULL,
        userId TEXT NOT NULL,
        field TEXT NOT NULL,
        oldValue TEXT,
        newValue TEXT,
        stored TEXT,
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ${PENDING_HISTORY_SCHEMA}.pendingBookmarkEdits_bookmarkId_idx
        ON pendingBookmarkEdits (bookmarkId);
    `);
    const columns = new Set(
      (
        sqlite
          .prepare(
            `PRAGMA ${PENDING_HISTORY_SCHEMA}.table_info(pendingBookmarkEdits)`,
          )
          .all() as { name: string }[]
      ).map((c) => c.name),
    );
    // Files created before eventId existed: a pending edit's rows share
    // createdAt, so that's a stable stand-in for its event id.
    if (!columns.has("eventId")) {
      sqlite.exec(`
        ALTER TABLE ${PENDING_EDITS_TABLE} ADD COLUMN eventId TEXT NOT NULL DEFAULT '';
        UPDATE ${PENDING_EDITS_TABLE} SET eventId = bookmarkId || ':' || createdAt;
      `);
    }
    if (!columns.has("stored")) {
      sqlite.exec(`ALTER TABLE ${PENDING_EDITS_TABLE} ADD COLUMN stored TEXT;`);
    }
    pendingHistoryState.available = true;
    return true;
  } catch (e) {
    logger.error(
      `[db] Failed to attach the pending edit history store at ${filename}: ${e}`,
    );
    pendingHistoryState.available = false;
    return false;
  }
}
