import "dotenv/config";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "path";
import serverConfig from "@karakeep/shared/config";

import dbConfig from "./drizzle.config";

const sqlite = new Database(dbConfig.dbCredentials.url);

if (serverConfig.database.walMode) {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
} else {
  sqlite.pragma('journal_mode = DELETE');
}
sqlite.pragma('cache_size = -65536');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('temp_store = MEMORY');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

export function getInMemoryDB(runMigrations: boolean) {
  const mem = new Database(":memory:");
  const db = drizzle(mem, { schema, logger: false });
  if (runMigrations) {
    migrate(db, { migrationsFolder: path.resolve(__dirname, "./drizzle") });
  }
  return db;
}
