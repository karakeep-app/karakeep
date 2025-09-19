import Database from "better-sqlite3";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export { SqliteError } from "better-sqlite3";

// This is exported here to avoid leaking better-sqlite types outside of this package.
export type KarakeepDBTransaction = SQLiteTransaction<
  "sync",
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
