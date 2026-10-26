import Database from "better-sqlite3";

import logger from "@karakeep/shared/logger";

const OPTIMIZE_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface OpenSqliteOptions {
  readOnly: boolean;
  walMode: boolean;
}

export function openSqliteDatabase(
  filename: string,
  options: OpenSqliteOptions,
) {
  const sqlite = new Database(
    filename,
    options.readOnly
      ? {
          readonly: true,
          fileMustExist: true,
        }
      : undefined,
  );

  if (!options.readOnly) {
    if (options.walMode) {
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("synchronous = NORMAL");
    } else {
      sqlite.pragma("journal_mode = DELETE");
    }
  }
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");

  if (options.readOnly) {
    sqlite.pragma("query_only = ON");
  } else {
    // Keep the query planner statistics fresh. Without them, sqlite picks bad
    // indexes for some queries (e.g. the link dedup check on every save).
    // The limit bounds the work per index, and 0x10000 makes the initial run
    // check all tables, as recommended for long-lived connections.
    sqlite.pragma("analysis_limit = 400");
    runOptimize(sqlite, "optimize = 0x10002");
    // The cast is needed because this file is also typechecked with DOM types
    // (where setInterval returns a number) by the mobile app.
    (
      setInterval(
        () => runOptimize(sqlite, "optimize"),
        OPTIMIZE_INTERVAL_MS,
      ) as unknown as { unref(): void }
    ).unref();
  }

  return sqlite;
}

function runOptimize(sqlite: Database.Database, pragma: string) {
  try {
    sqlite.pragma(pragma);
  } catch (e) {
    logger.warn(`[db] Failed to run PRAGMA ${pragma}: ${e}`);
  }
}
