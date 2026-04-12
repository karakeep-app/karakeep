import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";

import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { drizzle as sqliteDrizzle } from "drizzle-orm/better-sqlite3";
import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import serverConfig, { buildPgConnectionString } from "@karakeep/shared/config";

import { instrumentSqliteDatabase } from "./instrumentation";
import * as pgSchema from "./schema.pg";
import * as relations from "./schema.relations";
import * as sqliteSchema from "./schema.sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Raw database client, stored for graceful shutdown via close().
let _rawClient: Database.Database | ReturnType<typeof postgres> | null = null;

export const dialect = serverConfig.database.dialect;

// The canonical schema type used for DB typing.
// Both SQLite and PG schemas export identical table/column names, so the
// SQLite schema type is used as the canonical type for TypeScript regardless
// of the active dialect.  This avoids a union DB type that would break
// downstream consumers trying to call query / select / insert etc.
type FullSchema = typeof sqliteSchema & typeof relations;

async function createSqliteDB() {
  const { default: SqliteDatabase } =
    (await import("better-sqlite3")) as unknown as {
      default: new (filename: string | Buffer) => Database.Database;
    };
  const { drizzle } =
    (await import("drizzle-orm/better-sqlite3")) as unknown as {
      drizzle: typeof sqliteDrizzle;
    };

  const databaseURL = serverConfig.dataDir
    ? `${serverConfig.dataDir}/db.db`
    : "./db.db";

  const sqlite = new SqliteDatabase(databaseURL);
  _rawClient = sqlite;

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

async function createPostgresDB() {
  const { default: pgClient } = (await import("postgres")) as unknown as {
    default: typeof postgres;
  };
  const { drizzle } = (await import("drizzle-orm/postgres-js")) as unknown as {
    drizzle: typeof pgDrizzle;
  };

  const connectionString = buildPgConnectionString(serverConfig.database);

  // PostgreSQL COUNT/SUM return bigint (OID 20), which postgres.js delivers
  // as a string by default.  The app expects plain numbers everywhere, so
  // parse bigint results as Number via the documented types API.  Safe for
  // the counts and sums used in this application (well within
  // Number.MAX_SAFE_INTEGER).
  const client = pgClient(connectionString, {
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (val: number) => String(val),
        parse: (val: string) => Number(val),
      },
    },
  });
  _rawClient = client;

  // The codebase reads `.changes` on Drizzle mutation results (delete/update)
  // to get the affected row count.  This is a better-sqlite3 convention.
  // postgres.js uses `.count` instead.  Alias `.changes` on the Result
  // prototype so all existing call sites work without modification.
  const probe = await client`SELECT 1`;
  const ResultProto = Object.getPrototypeOf(probe);
  if (!("changes" in ResultProto)) {
    Object.defineProperty(ResultProto, "changes", {
      get() {
        return this.count;
      },
      configurable: true,
    });
  }

  // Verify the .changes patch works on a DML result.  DDL statements
  // (CREATE TABLE etc.) leave .count as null, so we need an actual
  // mutation to get a numeric value.
  // If postgres.js changes its Result class hierarchy, this will fail
  // immediately at startup rather than producing silent bugs at runtime.
  await client`CREATE TEMP TABLE IF NOT EXISTS _karakeep_verify(x int)`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const verify: any = await client`DELETE FROM _karakeep_verify`;
  await client`DROP TABLE IF EXISTS _karakeep_verify`;
  if (typeof verify.changes !== "number") {
    throw new Error(
      "PostgreSQL .changes compatibility patch failed. " +
        "This likely means the postgres.js driver version is incompatible. " +
        `Expected numeric .changes, got ${typeof verify.changes}. ` +
        "Pin postgres to ~3.4.9 or update the patch in drizzle.ts.",
    );
  }

  return drizzle(client, { schema: { ...pgSchema, ...relations } });
}

// Use BetterSQLite3Database as the canonical DB type so downstream consumers
// see a single concrete type rather than a union.  At runtime the PG drizzle
// instance is structurally compatible for all query / select / insert
// operations used by the application.
export const db: BetterSQLite3Database<FullSchema> =
  dialect === "postgresql"
    ? ((await createPostgresDB()) as unknown as BetterSQLite3Database<FullSchema>)
    : ((await createSqliteDB()) as unknown as BetterSQLite3Database<FullSchema>);
export type DB = typeof db;

// Dialect-agnostic transaction type inferred from the db instance
export type KarakeepDBTransaction = Parameters<
  Parameters<DB["transaction"]>[0]
>[0];

export async function getInMemoryDB(runMigrations: boolean) {
  const { default: SqliteDatabase } =
    (await import("better-sqlite3")) as unknown as {
      default: new (filename: string | Buffer) => Database.Database;
    };
  const { drizzle } =
    (await import("drizzle-orm/better-sqlite3")) as unknown as {
      drizzle: typeof sqliteDrizzle;
    };
  const { migrate } =
    (await import("drizzle-orm/better-sqlite3/migrator")) as unknown as {
      migrate: typeof sqliteMigrate;
    };

  const mem = new SqliteDatabase(":memory:");
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

/**
 * Gracefully close the database connection.
 * Safe to call multiple times; no-ops after the first call.
 */
export async function close(): Promise<void> {
  if (_rawClient === null) return;
  if (dialect === "postgresql") {
    await (_rawClient as ReturnType<typeof postgres>).end();
  } else {
    (_rawClient as Database.Database).close();
  }
  _rawClient = null;
}
