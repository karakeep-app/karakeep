import type { ResultSet } from "@libsql/client";
import { LibsqlError } from "@libsql/client";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";

export { LibsqlError as SqliteError } from "@libsql/client";

// This is exported here to avoid leaking libsql types outside of this package.
export type KarakeepDBTransaction = SQLiteTransaction<
  "async",
  ResultSet,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export function getLibsqlError(e: unknown): LibsqlError | null {
  if (e instanceof LibsqlError) {
    return e;
  }
  if (typeof e === "object" && e !== null && "cause" in e) {
    const cause = (e as { cause?: unknown }).cause;
    if (cause instanceof LibsqlError) {
      return cause;
    }
  }
  return null;
}
