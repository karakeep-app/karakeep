import Database from "better-sqlite3";

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
  }

  return sqlite;
}
