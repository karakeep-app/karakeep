import Database from "better-sqlite3";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export { isUniqueConstraintError } from "./errors";

// Temporarily keep the SQLite-specific transaction type.
// This will be replaced with a dialect-agnostic type in Task 8.
export type KarakeepDBTransaction = SQLiteTransaction<
  "sync",
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
