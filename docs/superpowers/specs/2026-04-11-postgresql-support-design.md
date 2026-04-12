# PostgreSQL Support for Karakeep

**Date:** 2026-04-11
**Status:** Approved

## Motivation

SQLite performs poorly over network-attached storage (NFS, SMB, cloud providers). Users who want to host their database on a NAS or remote server need a client-server database. Adding PostgreSQL as a configurable alternative to SQLite enables these deployment scenarios while keeping SQLite as the zero-setup default.

## Configuration

### Database Dialect Selection

A new `DATABASE_DIALECT` environment variable is the authoritative switch:

- `sqlite` (default): SQLite mode, behaves exactly as today
- `postgresql`: PostgreSQL mode

### PostgreSQL Connection

When `DATABASE_DIALECT=postgresql`, the connection is specified via either a URL or individual fields:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_DIALECT` | `sqlite` or `postgresql` | No (defaults to `sqlite`) |
| `DATABASE_URL` | PostgreSQL connection string | One of URL or individual fields |
| `DATABASE_HOST` | PostgreSQL hostname | One of URL or individual fields |
| `DATABASE_PORT` | PostgreSQL port (default: 5432) | No |
| `DATABASE_USER` | PostgreSQL username | One of URL or individual fields |
| `DATABASE_PASSWORD` | PostgreSQL password | One of URL or individual fields |
| `DATABASE_NAME` | PostgreSQL database name | One of URL or individual fields |

If both `DATABASE_URL` and individual fields are provided, `DATABASE_URL` takes precedence (with a warning logged).

If `DATABASE_DIALECT=postgresql` but no connection info is provided, the app fails at startup with a clear error.

Existing SQLite-only variables (`DATA_DIR`, `DB_WAL_MODE`) are unaffected and ignored in PostgreSQL mode.

### Config Schema

In `packages/shared/config.ts`, the `database` section expands to:

```typescript
database: {
  dialect: "sqlite" | "postgresql",
  url: string | null,       // DATABASE_URL, null for sqlite
  host: string | null,
  port: number,
  user: string | null,
  password: string | null,
  name: string | null,
  walMode: boolean,         // sqlite only
}
```

The dialect is validated by Zod at startup. When `dialect` is `postgresql`, Zod validates that either `url` or (`host` + `user` + `password` + `name`) are provided.

## Schema Architecture

### File Structure

```
packages/db/
  schema.ts              # Entry point: re-exports from the active dialect + relations
  schema.sqlite.ts       # SQLite schema (current schema.ts, renamed)
  schema.pg.ts           # PostgreSQL equivalent
  schema.relations.ts    # Relations definitions (dialect-agnostic, shared)
```

### Entry Point

`schema.ts` conditionally re-exports from the correct dialect and always re-exports relations. The conceptual intent is:

```typescript
// Re-export all tables from the active dialect
// Re-export all relations
```

Note: TypeScript does not support `export * from <dynamic expression>`. The implementation will use a mechanism such as conditional `import()` with re-assignment, a build-time entry point swap, or explicit conditional re-exports. The contract is that `@karakeep/db/schema` exposes the same set of table and relation names regardless of dialect.

### Relations

All 21 `relations()` definitions move to `schema.relations.ts`. Drizzle's `relations()` helper is dialect-agnostic — it references table objects by variable, not by dialect type.

To avoid circular imports (since `schema.ts` re-exports from `schema.relations.ts`), the relations file imports table objects directly from the active dialect file rather than from `schema.ts`. The exact import mechanism mirrors whatever `schema.ts` uses for its conditional re-export.

### Column Type Mapping

| SQLite | PostgreSQL |
|--------|-----------|
| `sqliteTable` | `pgTable` |
| `text("col")` | `text("col")` |
| `integer("col")` | `integer("col")` |
| `integer("col", {mode:"timestamp"})` | `timestamp("col", {withTimezone:true})` |
| `integer("col", {mode:"timestamp_ms"})` | `timestamp("col", {withTimezone:true, mode:"date"})` |
| `integer("col", {mode:"boolean"})` | `boolean("col")` |
| `real("col")` | `doublePrecision("col")` |
| `text("col", {mode:"json"})` | `jsonb("col")` |
| `AnySQLiteColumn` | `AnyPgColumn` |

### Exported Names

All exported table and column names remain identical. Consuming code (`packages/trpc/`, `apps/workers/`, etc.) imports `users`, `bookmarks`, etc. from `@karakeep/db/schema` and sees the same names regardless of dialect.

### Generated Column

The `bookmarkTags.normalizedName` generated column uses `lower(replace(replace(replace(...))))` which is standard SQL and works identically in both SQLite and PostgreSQL.

## Database Connection & Driver Layer

### Factory Pattern

`packages/db/drizzle.ts` becomes a factory:

```typescript
function createSqliteDB() { /* current logic: better-sqlite3, PRAGMAs */ }
function createPostgresDB() { /* postgres.js + drizzle-orm/postgres-js */ }

const { db, dialect } = serverConfig.database.dialect === "postgresql"
  ? createPostgresDB()
  : createSqliteDB();

export { db, dialect };
export type DB = typeof db;
```

### SQLite Path

Unchanged behavior: `better-sqlite3` driver, synchronous, with PRAGMAs for WAL mode, cache size, foreign keys, and temp store.

### PostgreSQL Path

Uses `postgres` (postgres.js) as the driver. It is the Drizzle-recommended PostgreSQL driver, lightweight, and has no native compilation dependencies.

### Async Consideration

`better-sqlite3` is synchronous, `postgres.js` is async. Drizzle ORM's query builder returns promises for both — SQLite resolves synchronously. Consuming code already `await`s all queries via Drizzle, so no application-level changes are needed.

### Drizzle Kit Configs

Split into two files for migration generation:

- `drizzle.config.sqlite.ts` — points to `schema.sqlite.ts`, outputs to `migrations/sqlite/`
- `drizzle.config.pg.ts` — points to `schema.pg.ts`, outputs to `migrations/pg/`

### In-Memory Database

`getInMemoryDB()` remains SQLite-only (used for tests). PostgreSQL test infrastructure is out of scope for this work.

## Error Abstraction

### Current State

`SqliteError` is imported in 3 files (`packages/trpc/models/users.ts`, `tags.ts`, `lists.ts`) to check:

- `SQLITE_CONSTRAINT_UNIQUE` — duplicate key
- `SQLITE_CONSTRAINT_PRIMARYKEY` — duplicate primary key

### New Approach

Export predicate functions from `@karakeep/db`:

```typescript
// packages/db/errors.ts
export function isUniqueConstraintError(e: unknown): boolean {
  // SQLite: SqliteError with code SQLITE_CONSTRAINT_UNIQUE or SQLITE_CONSTRAINT_PRIMARYKEY
  // PostgreSQL: DatabaseError with code "23505"
}
```

Consuming code changes from:

```typescript
import { SqliteError } from "@karakeep/db";
if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
```

To:

```typescript
import { isUniqueConstraintError } from "@karakeep/db";
if (isUniqueConstraintError(e)) {
```

The `SqliteError` export from `@karakeep/db/index.ts` is removed.

## Type Exports

### Transaction Type

`KarakeepDBTransaction` becomes dialect-aware via TypeScript inference:

```typescript
// packages/db/index.ts
import { db } from "./drizzle";

export type DB = typeof db;
export type KarakeepDBTransaction = Parameters<
  Parameters<DB["transaction"]>[0]
>[0];
```

This extracts the transaction type from whichever `db` instance is active, without importing dialect-specific types.

### Export Changes

- `SqliteError` export removed (replaced by error predicates)
- `db`, `DB`, `KarakeepDBTransaction` continue to be exported
- Schema re-exports work unchanged since `schema.ts` is the dialect-aware entry point

## Migration Strategy

### Directory Structure

```
packages/db/
  migrations/
    sqlite/
      0000_*.sql
      ...
      0082_*.sql
      meta/
        _journal.json
        0000_snapshot.json
        ...
    pg/
      0000_initial.sql
      meta/
        _journal.json
        0000_snapshot.json
```

### Existing SQLite Migrations

The existing 83 migration files move from `drizzle/` to `migrations/sqlite/`, including the `meta/` directory.

### PostgreSQL Baseline

A single `0000_initial.sql` migration creates all 32 tables as they exist today. Generated by pointing Drizzle Kit at `schema.pg.ts` with an empty migration history.

### Runtime Migration

`migrate.ts` reads the dialect from config and runs migrations from the appropriate directory (`migrations/sqlite/` or `migrations/pg/`).

### Going Forward

When a schema change is made:

1. Developer updates both `schema.sqlite.ts` and `schema.pg.ts`
2. Runs `drizzle-kit generate` for both dialects
3. Each produces a new migration file in its respective directory

## Instrumentation

Two separate instrumentation functions, one per dialect:

```typescript
// instrumentation.ts
export function instrumentSqliteDatabase(sqlite: Database.Database) { /* existing logic */ }
export function instrumentPostgresConnection(/* postgres.js options */) { /* pg-specific */ }
```

Both produce OTel spans with the same attribute structure (`db.statement`, `db.operation`), differing only in `db.system` (`"sqlite"` vs `"postgresql"`).

Each function is called only from the respective `createSqliteDB()` / `createPostgresDB()` path.

## Raw SQL Compatibility

### Domain Extraction

`packages/trpc/models/users.ts` (lines 715 and 1048) uses `INSTR`/`SUBSTR` for URL domain extraction — SQLite-specific functions. PostgreSQL equivalents are `POSITION`/`SUBSTRING`.

A dialect-aware helper in `@karakeep/db` replaces the inline SQL:

```typescript
// packages/db/sql-helpers.ts
export function domainFromUrl(urlColumn: AnyColumn): SQL {
  if (dialect === "postgresql") {
    // PostgreSQL: regexp_replace or substring with regex
  } else {
    // SQLite: current INSTR/SUBSTR logic
  }
}
```

The two call sites replace inline SQL with `domainFromUrl(bookmarkLinks.url)`.

If more raw SQL incompatibilities surface during implementation, the same pattern applies — add a helper to `sql-helpers.ts`.

## Auth Adapter

`@auth/drizzle-adapter` accepts a generic Drizzle instance and table references. Since `db` and the table objects are already dialect-aware, the auth setup in `apps/web/server/auth.ts` requires no changes. The adapter supports both SQLite and PostgreSQL.

## SQLite-to-PostgreSQL Migration Script

### Location

`packages/db/scripts/migrate-to-pg.ts`

### Process

1. Reads the SQLite database path from `DATA_DIR`
2. Requires PostgreSQL connection to be configured (`DATABASE_DIALECT=postgresql` + connection info)
3. Runs PostgreSQL migrations on the target to create the schema
4. Iterates through tables in dependency order (respecting foreign keys)
5. Reads rows from SQLite, transforms data types, bulk-inserts into PostgreSQL
6. Reports progress per table (row counts, skipped rows)

### Data Type Transformations

- Integer timestamps (epoch seconds) → PostgreSQL `timestamp with time zone` via `to_timestamp()`
- Integer booleans (0/1) → PostgreSQL `boolean`
- Text JSON strings → PostgreSQL `jsonb` (parse and re-serialize)

### What Carries Over

All 32 tables' data — users, bookmarks, tags, lists, settings, relationships.

### What Doesn't Carry Over

- `normalizedName` generated column — PostgreSQL regenerates it automatically
- SQLite internal state (WAL files, etc.)

### Limitations

- One-way migration only (SQLite → PostgreSQL)
- One-time operation, no incremental sync
- No rollback — users should back up their SQLite database first (script logs this warning)

### Usage

```bash
pnpm db:migrate-to-pg
```

## Documentation

### Configuration Docs

`docs/docs/03-configuration/01-environment-variables.md` gains a "Database" section documenting all `DATABASE_*` environment variables. `DATA_DIR` and `DB_WAL_MODE` are documented as SQLite-only.

### PostgreSQL Guide

A new guide covering:

- When to use PostgreSQL (remote/NAS/cloud scenarios)
- How to configure the connection
- Running the migration script from SQLite
- Example env configurations for common setups

### Docker

No changes to `docker-compose.yml` — users bring their own PostgreSQL. Documentation covers how to pass `DATABASE_*` env vars to the container.

## Package Dependencies

`packages/db/package.json` adds:

- `postgres` — postgres.js driver (no native compilation required)

`drizzle-orm/postgres-js` is already available within the existing `drizzle-orm` dependency.

## Out of Scope

- **Connection pooling** — postgres.js handles connections internally; external poolers are the user's responsibility
- **PostgreSQL-specific features** — No JSONB queries, full-text search, or PG-only capabilities. Both dialects get identical functionality.
- **PostgreSQL test infrastructure** — `getInMemoryDB()` remains SQLite-only
- **Automatic dialect detection** — No sniffing; `DATABASE_DIALECT` is the explicit switch
- **Bidirectional migration** — PG-to-SQLite is not provided
- **Schema drift CI checks** — Verifying both schemas stay in sync is a follow-up
