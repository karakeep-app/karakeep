import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";

import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { drizzle as sqliteDrizzle } from "drizzle-orm/better-sqlite3";
import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type {
  drizzle as pgDrizzle,
  PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import type postgres from "postgres";

import serverConfig, { buildPgConnectionString } from "@karakeep/shared/config";
import logger from "@karakeep/shared/logger";

import { instrumentSqliteDatabase } from "./instrumentation";
import * as pgSchema from "./schema.pg";
import * as relations from "./schema.relations";
import * as sqliteSchema from "./schema.sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Raw database client, stored for graceful shutdown via close().
let _rawClient: Database.Database | ReturnType<typeof postgres> | null = null;

export const dialect = serverConfig.database.dialect;

// Optional SQL query logging, routed through the app logger at debug level.
// Gated behind DB_QUERY_LOGGING (not just LOG_LEVEL) because it is high-volume
// and may include query parameter values.  Enable it to see what the DB is
// doing — e.g. exactly when a query fires relative to the request that issued
// it.  When disabled it is `false`, so Drizzle never invokes it (zero cost).
const queryLogger = serverConfig.dbQueryLogging
  ? {
      logQuery(query: string, params: unknown[]) {
        logger.debug(
          `[db] ${query}${params.length ? ` -- params: ${JSON.stringify(params)}` : ""}`,
        );
      },
    }
  : false;

// The canonical schema type used for DB typing.
// Both SQLite and PG schemas export identical table/column names, so the
// SQLite schema type is used as the canonical type for TypeScript regardless
// of the active dialect.  This avoids a union DB type that would break
// downstream consumers trying to call query / select / insert etc.
type FullSchema = typeof sqliteSchema & typeof relations;

// Compile-time check: verify that PostgresJsDatabase exposes the same
// core methods as BetterSQLite3Database.  If a Drizzle upgrade breaks
// structural compatibility, this block will produce a type error.
// See .claude/specs/2026-04-12-postgresql-review-fixes-design.md for rationale.
type _PgDB = PostgresJsDatabase<FullSchema>;
type _AssertHas<T, K extends keyof T> = K;
type _PgCompat =
  | _AssertHas<_PgDB, "select">
  | _AssertHas<_PgDB, "selectDistinct">
  | _AssertHas<_PgDB, "insert">
  | _AssertHas<_PgDB, "update">
  | _AssertHas<_PgDB, "delete">
  | _AssertHas<_PgDB, "query">
  | _AssertHas<_PgDB, "transaction">
  | _AssertHas<_PgDB, "$count">;
type _Used = _PgCompat; // suppress unused warning

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

  logger.info(`[db] opening SQLite database at ${databaseURL}`);
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

  return drizzle(sqlite, {
    schema: { ...sqliteSchema, ...relations },
    logger: queryLogger,
  });
}

async function createPostgresDB() {
  const { default: pgClient } = (await import("postgres")) as unknown as {
    default: typeof postgres;
  };
  const { drizzle } = (await import("drizzle-orm/postgres-js")) as unknown as {
    drizzle: typeof pgDrizzle;
  };

  const connectionString = buildPgConnectionString(serverConfig.database);

  logger.info(
    `[db] connecting to PostgreSQL ${serverConfig.database.host ?? "?"}:${serverConfig.database.port}/${serverConfig.database.name ?? "?"}`,
  );

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
  logger.info("[db] PostgreSQL connection established");
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

  return drizzle(client, {
    schema: { ...pgSchema, ...relations },
    logger: queryLogger,
  });
}

// Drizzle has no shared base type between SQLite and PG — they are separate
// type hierarchies.  A union type would require narrowing at every call site
// (~250 usages across 47 files), and a wrapper class can't properly type the
// dialect-specific builder return values.
//
// Instead we use BetterSQLite3Database as the canonical compile-time type and
// cast the PG instance into it.  This works because the query builder APIs are
// structurally compatible at runtime.  The _PgCompat type assertion above
// catches Drizzle upgrades that remove any of the methods we depend on.
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
