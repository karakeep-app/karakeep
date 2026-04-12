import "dotenv/config";

import { createRequire } from "node:module";
import path from "path";
import { fileURLToPath } from "url";

import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { drizzle as sqliteDrizzle } from "drizzle-orm/better-sqlite3";
import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import serverConfig from "@karakeep/shared/config";

import { instrumentSqliteDatabase } from "./instrumentation";
import * as pgSchema from "./schema.pg";
import * as relations from "./schema.relations";
import * as sqliteSchema from "./schema.sqlite";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dialect = serverConfig.database.dialect;

// The canonical schema type used for DB typing.
// Both SQLite and PG schemas export identical table/column names, so the
// SQLite schema type is used as the canonical type for TypeScript regardless
// of the active dialect.  This avoids a union DB type that would break
// downstream consumers trying to call query / select / insert etc.
type FullSchema = typeof sqliteSchema & typeof relations;

function createSqliteDB() {
  const Database = require("better-sqlite3") as {
    new (filename: string | Buffer): Database.Database;
  };
  const { drizzle } = require("drizzle-orm/better-sqlite3") as {
    drizzle: typeof sqliteDrizzle;
  };

  const databaseURL = serverConfig.dataDir
    ? `${serverConfig.dataDir}/db.db`
    : "./db.db";

  const sqlite = new Database(databaseURL);

  if (serverConfig.database.walMode) {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
  } else {
    sqlite.pragma("journal_mode = DELETE");
  }
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");

  instrumentSqliteDatabase(sqlite);

  return drizzle(sqlite, { schema: { ...sqliteSchema, ...relations } });
}

function createPostgresDB() {
  const pgClient = require("postgres") as typeof postgres;
  const { drizzle } = require("drizzle-orm/postgres-js") as {
    drizzle: typeof pgDrizzle;
  };

  const dbConfig = serverConfig.database;
  const connectionString =
    dbConfig.url ??
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;

  const client = pgClient(connectionString);
  // PostgreSQL COUNT/SUM return bigint (OID 20), which postgres.js delivers
  // as a string by default.  The app expects plain numbers everywhere, so
  // parse bigint results as Number.  Safe for the counts and sums used in
  // this application (well within Number.MAX_SAFE_INTEGER).
  client.options.parsers["20"] = (val: string) => Number(val);
  return drizzle(client, { schema: { ...pgSchema, ...relations } });
}

// Use BetterSQLite3Database as the canonical DB type so downstream consumers
// see a single concrete type rather than a union.  At runtime the PG drizzle
// instance is structurally compatible for all query / select / insert
// operations used by the application.
export const db: BetterSQLite3Database<FullSchema> =
  dialect === "postgresql"
    ? (createPostgresDB() as unknown as BetterSQLite3Database<FullSchema>)
    : createSqliteDB();
export type DB = typeof db;

// Dialect-agnostic transaction type inferred from the db instance
export type KarakeepDBTransaction = Parameters<
  Parameters<DB["transaction"]>[0]
>[0];

export function getInMemoryDB(runMigrations: boolean) {
  const Database = require("better-sqlite3") as {
    new (filename: string | Buffer): Database.Database;
  };
  const { drizzle } = require("drizzle-orm/better-sqlite3") as {
    drizzle: typeof sqliteDrizzle;
  };
  const { migrate } = require("drizzle-orm/better-sqlite3/migrator") as {
    migrate: typeof sqliteMigrate;
  };

  const mem = new Database(":memory:");
  const db = drizzle(mem, {
    schema: { ...sqliteSchema, ...relations },
    logger: false,
  });
  if (runMigrations) {
    migrate(db, {
      migrationsFolder: path.resolve(__dirname, "./migrations/sqlite"),
    });
  }
  return db;
}
