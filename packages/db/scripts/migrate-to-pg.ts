/**
 * One-way data migration script: SQLite -> PostgreSQL
 *
 * Usage:
 *   DATABASE_DIALECT=postgresql \
 *   DATABASE_URL=postgresql://user:pass@host:5432/dbname \
 *   DATA_DIR=/path/to/data \
 *   pnpm --filter @karakeep/db migrate-to-pg
 *
 * Or with individual fields:
 *   DATABASE_DIALECT=postgresql \
 *   DATABASE_HOST=localhost DATABASE_PORT=5432 \
 *   DATABASE_USER=karakeep DATABASE_PASSWORD=secret DATABASE_NAME=karakeep \
 *   DATA_DIR=/path/to/data \
 *   pnpm --filter @karakeep/db migrate-to-pg
 */

import "dotenv/config";

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type Database from "better-sqlite3";
import type { migrate as pgMigrate } from "drizzle-orm/postgres-js/migrator";
import type postgres from "postgres";

import serverConfig from "@karakeep/shared/config";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (serverConfig.database.dialect !== "postgresql") {
  console.error(
    "ERROR: DATABASE_DIALECT must be set to 'postgresql' to run this migration.",
  );
  process.exit(1);
}

const dbConfig = serverConfig.database;
const connectionString =
  dbConfig.url ??
  `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;

/** Mask the password in a connection string for safe logging. */
function maskPassword(connStr: string): string {
  return connStr.replace(/:([^:@]+)@/, ":****@");
}

const sqlitePath = serverConfig.dataDir
  ? path.join(serverConfig.dataDir, "db.db")
  : "./db.db";

console.log("=".repeat(70));
console.log("  Karakeep SQLite -> PostgreSQL Migration");
console.log("=".repeat(70));
console.log();
console.log("WARNING: This script migrates data from SQLite to PostgreSQL.");
console.log("         Please ensure you have a backup of both databases");
console.log("         before proceeding. This operation is irreversible.");
console.log();
console.log(`  SQLite source  : ${sqlitePath}`);
console.log(`  PG target      : ${maskPassword(connectionString)}`);
console.log();

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

interface TableSpec {
  /** SQLite table name to read from */
  table: string;
  /** Columns that contain epoch-second (or epoch-ms) integer timestamps */
  timestampCols?: string[];
  /**
   * Columns that store epoch-millisecond timestamps (Drizzle's
   * `integer({ mode: "timestamp_ms" })`).  When absent, any column listed in
   * `timestampCols` is assumed to be epoch-seconds.
   */
  timestampMsCols?: string[];
  /** Columns that store 0/1 integers representing booleans */
  boolCols?: string[];
  /** Columns that store JSON text which should be parsed before insert */
  jsonCols?: string[];
  /** Columns to omit from the insert (e.g. generated/computed columns) */
  skipCols?: string[];
}

// ---------------------------------------------------------------------------
// Table specifications (order respects foreign-key dependencies)
// ---------------------------------------------------------------------------

const TABLE_SPECS: TableSpec[] = [
  // ---- auth / user tables ----
  {
    table: "user",
    timestampMsCols: ["emailVerified"],
    boolCols: [
      "browserCrawlingEnabled",
      "backupsEnabled",
      "autoTaggingEnabled",
      "autoSummarizationEnabled",
    ],
    jsonCols: ["curatedTagIds"],
  },
  {
    table: "config",
  },
  {
    table: "account",
  },
  {
    table: "session",
    timestampMsCols: ["expires"],
  },
  {
    table: "verificationToken",
    timestampMsCols: ["expires"],
  },
  {
    table: "passwordResetToken",
    timestampMsCols: ["expires"],
    timestampCols: ["createdAt"],
  },
  {
    table: "apiKey",
    timestampCols: ["createdAt", "lastUsedAt"],
  },

  // ---- core bookmark tables ----
  {
    table: "bookmarks",
    timestampCols: ["createdAt", "modifiedAt"],
    boolCols: ["archived", "favourited"],
  },
  {
    table: "bookmarkLinks",
    timestampCols: ["datePublished", "dateModified", "crawledAt"],
  },
  {
    table: "bookmarkTexts",
  },
  {
    table: "bookmarkAssets",
  },
  {
    table: "assets",
  },
  {
    table: "bookmarkTags",
    timestampCols: ["createdAt"],
    skipCols: ["normalizedName"],
  },
  {
    table: "tagsOnBookmarks",
    timestampCols: ["attachedAt"],
  },

  // ---- highlights / reading progress ----
  {
    table: "highlights",
    timestampCols: ["createdAt"],
  },
  {
    table: "userReadingProgress",
    timestampCols: ["modifiedAt"],
  },

  // ---- lists ----
  {
    table: "bookmarkLists",
    timestampCols: ["createdAt"],
    boolCols: ["public"],
  },
  {
    table: "bookmarksInLists",
    timestampCols: ["addedAt"],
  },
  {
    table: "listCollaborators",
    timestampCols: ["addedAt"],
  },
  {
    table: "listInvitations",
    timestampCols: ["invitedAt"],
  },

  // ---- prompts / feeds / webhooks ----
  {
    table: "customPrompts",
    timestampCols: ["createdAt"],
    boolCols: ["enabled"],
  },
  {
    table: "rssFeeds",
    timestampCols: ["createdAt", "lastFetchedAt", "lastSuccessfulFetchAt"],
    boolCols: ["enabled", "importTags"],
  },
  {
    table: "rssFeedImports",
    timestampCols: ["createdAt"],
  },
  {
    table: "webhooks",
    timestampCols: ["createdAt"],
    jsonCols: ["events"],
  },

  // ---- backups ----
  {
    table: "backups",
    timestampCols: ["createdAt"],
  },

  // ---- rule engine ----
  {
    table: "ruleEngineRules",
    boolCols: ["enabled"],
  },
  {
    table: "ruleEngineActions",
  },

  // ---- invites / subscriptions ----
  {
    table: "invites",
    timestampCols: ["createdAt", "usedAt"],
  },
  {
    table: "subscriptions",
    timestampCols: ["startDate", "endDate", "createdAt", "modifiedAt"],
    boolCols: ["cancelAtPeriodEnd"],
  },

  // ---- import sessions ----
  {
    table: "importSessions",
    timestampCols: ["lastProcessedAt", "createdAt", "modifiedAt"],
  },
  {
    table: "importSessionBookmarks",
    timestampCols: ["createdAt"],
  },
  {
    table: "importStagingBookmarks",
    timestampCols: [
      "sourceAddedAt",
      "processingStartedAt",
      "createdAt",
      "completedAt",
    ],
    boolCols: ["archived"],
    jsonCols: ["tags", "listIds"],
  },
];

// ---------------------------------------------------------------------------
// Data-type transformation helpers
// ---------------------------------------------------------------------------

/**
 * Convert an epoch-second integer (as stored by Drizzle's
 * `integer({ mode: "timestamp" })`) to a JavaScript Date.
 * Returns null for null/undefined values.
 */
function epochSecToDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return new Date((value as number) * 1000);
}

/**
 * Convert an epoch-millisecond integer (as stored by Drizzle's
 * `integer({ mode: "timestamp_ms" })`) to a JavaScript Date.
 * Returns null for null/undefined values.
 */
function epochMsToDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  return new Date(value as number);
}

/** Convert a SQLite 0/1 integer to a JavaScript boolean. */
function intToBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return (value as number) !== 0;
}

/** Parse a JSON text column. */
function parseJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}

/**
 * Transform a raw SQLite row according to the table spec.
 * Returns a new record with the appropriate JS types substituted.
 */
function transformRow(
  row: Record<string, unknown>,
  spec: TableSpec,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [col, value] of Object.entries(row)) {
    // Skip generated / computed columns
    if (spec.skipCols?.includes(col)) continue;

    if (spec.timestampMsCols?.includes(col)) {
      result[col] = epochMsToDate(value);
    } else if (spec.timestampCols?.includes(col)) {
      result[col] = epochSecToDate(value);
    } else if (spec.boolCols?.includes(col)) {
      result[col] = intToBool(value);
    } else if (spec.jsonCols?.includes(col)) {
      result[col] = parseJson(value);
    } else {
      result[col] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Core migration logic
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 500;

async function migrateTable(
  sqlite: Database.Database,
  pg: postgres.Sql,
  spec: TableSpec,
): Promise<void> {
  const { table } = spec;

  // Count rows for progress reporting
  const countRow = sqlite
    .prepare(`SELECT COUNT(*) as cnt FROM "${table}"`)
    .get() as { cnt: number };
  const totalRows = countRow.cnt;

  if (totalRows === 0) {
    console.log(`  [${table}] 0 rows — skipping`);
    return;
  }

  // Read all column names (minus skipped ones) by inspecting the first row
  // via SQLite's PRAGMA table_info.
  const columns: string[] = (
    sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
  )
    .map((r) => r.name)
    .filter((col) => !(spec.skipCols ?? []).includes(col));

  let insertedCount = 0;

  // Stream in chunks
  const stmt = sqlite.prepare(`SELECT * FROM "${table}"`);
  let chunk: Record<string, unknown>[] = [];

  for (const rawRow of stmt.iterate()) {
    const transformed = transformRow(rawRow as Record<string, unknown>, spec);
    chunk.push(transformed);

    if (chunk.length >= CHUNK_SIZE) {
      await insertChunk(pg, table, columns, chunk);
      insertedCount += chunk.length;
      console.log(`  [${table}] ${insertedCount} / ${totalRows} rows inserted`);
      chunk = [];
    }
  }

  // Flush remaining rows
  if (chunk.length > 0) {
    await insertChunk(pg, table, columns, chunk);
    insertedCount += chunk.length;
  }

  console.log(`  [${table}] Done — ${insertedCount} rows migrated`);
}

async function insertChunk(
  pg: postgres.Sql,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  // Build a parameterised bulk insert using pg.unsafe() with explicit
  // positional parameters so we avoid any SQL injection risk while still
  // being able to use postgres.js parameter syntax.
  //
  // Pattern:  INSERT INTO "table" ("col1","col2",...) VALUES ($1,$2,...),(...),...
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const values: unknown[] = [];
  const rowPlaceholders: string[] = [];

  for (const row of rows) {
    const placeholders: string[] = [];
    for (const col of columns) {
      values.push(row[col] ?? null);
      placeholders.push(`$${values.length}`);
    }
    rowPlaceholders.push(`(${placeholders.join(", ")})`);
  }

  const sql = `INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders.join(", ")} ON CONFLICT DO NOTHING`;

  await pg.unsafe(sql, values as never[]);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Open SQLite in readonly mode
  const BetterSQLite = require("better-sqlite3") as {
    new (filename: string, options?: { readonly?: boolean }): Database.Database;
  };
  const sqlite = new BetterSQLite(sqlitePath, { readonly: true });
  console.log("SQLite database opened (readonly).");

  // Connect to PostgreSQL
  const pgClient = require("postgres") as typeof postgres;
  const pg = pgClient(connectionString);
  console.log("PostgreSQL connection established.");

  // Run PG migrations first
  console.log("\nRunning PostgreSQL migrations...");
  const { drizzle } =
    require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  const { migrate } = require("drizzle-orm/postgres-js/migrator") as {
    migrate: typeof pgMigrate;
  };

  const pgDrizzle = drizzle(pg);
  await migrate(pgDrizzle, {
    migrationsFolder: path.resolve(__dirname, "../migrations/pg"),
  });
  console.log("Migrations complete.\n");

  // Migrate each table in dependency order
  console.log(`Migrating ${TABLE_SPECS.length} tables...\n`);
  for (const spec of TABLE_SPECS) {
    await migrateTable(sqlite, pg, spec);
  }

  // Cleanup
  sqlite.close();
  await pg.end();

  console.log("\nMigration complete!");
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
