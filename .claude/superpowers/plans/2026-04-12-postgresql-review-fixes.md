# PostgreSQL PR Review Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all code review issues from PR #4 (PostgreSQL support) with minimal files touched.

**Architecture:** Seven targeted fixes across 6 source files + 2 env samples. The heaviest change is in `packages/db/drizzle.ts` which gets three improvements: public API for bigint parsing, fail-fast guard for the `.changes` patch, and a new `close()` export. All other files are single-change edits.

**Tech Stack:** TypeScript, postgres.js, Drizzle ORM, Docker Compose

**Spec:** `.claude/specs/2026-04-12-postgresql-review-fixes-design.md`

---

### Task 1: Fix migration script column name bug

The `listCollaborators` TABLE_SPEC references the Drizzle field name `addedAt`, but the actual SQL column is `createdAt` (produced by `createdAtField()` which uses `integer("createdAt", ...)`). The migration script reads raw SQL column names via `SELECT *`, so the spec must use the SQL column name.

**Files:**
- Modify: `packages/db/scripts/migrate-to-pg.ts:182`

- [ ] **Step 1: Fix the column name**

In `packages/db/scripts/migrate-to-pg.ts`, change line 182:

```ts
// BEFORE
    timestampCols: ["addedAt"],

// AFTER
    timestampCols: ["createdAt"],
```

This is inside the `listCollaborators` entry in the `TABLE_SPECS` array (around line 181-183). The entry just above it (`bookmarksInLists`) also has `timestampCols: ["addedAt"]` — that one is correct because its SQL column is actually named `addedAt`. Only change the `listCollaborators` entry.

- [ ] **Step 2: Verify no other column name mismatches**

Run a quick search to confirm there are no other TABLE_SPECS entries referencing Drizzle field names instead of SQL column names. The known pattern is fields that use `createdAtField()` or `modifiedAtField()` helper functions — these produce SQL columns named `createdAt`/`modifiedAt` regardless of the Drizzle field name.

Run: `grep -n "createdAtField\|modifiedAtField" packages/db/schema.sqlite.ts`

Cross-reference each result against the TABLE_SPECS entries. Every Drizzle field that uses `createdAtField()` should have `"createdAt"` in its TABLE_SPECS timestampCols, not the Drizzle field name.

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/migrate-to-pg.ts
git commit -m "fix(db): correct listCollaborators timestamp column name in migration script

The TABLE_SPECS entry referenced the Drizzle field name 'addedAt' but the
SQL column produced by createdAtField() is 'createdAt'. Since the migration
reads raw SQL column names via SELECT *, the timestamp conversion was being
skipped for this table."
```

---

### Task 2: URL-encode credentials in connection string builder

Passwords containing URI-special characters (`@`, `:`, `/`, `#`) will break the connection string. Apply `encodeURIComponent()` to user and password.

**Files:**
- Modify: `packages/shared/config.ts:553-560`

- [ ] **Step 1: Update `buildPgConnectionString`**

In `packages/shared/config.ts`, replace the `buildPgConnectionString` function (lines 553-560):

```ts
// BEFORE
export function buildPgConnectionString(
  dbConfig: typeof serverConfig.database,
): string {
  return (
    dbConfig.url ??
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`
  );
}

// AFTER
export function buildPgConnectionString(
  dbConfig: typeof serverConfig.database,
): string {
  return (
    dbConfig.url ??
    `postgresql://${encodeURIComponent(dbConfig.user!)}:${encodeURIComponent(dbConfig.password!)}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`
  );
}
```

The `!` non-null assertions are safe because Zod validation in `serverConfigSchema` (earlier in the same file) already ensures `user`, `password`, `host`, and `name` are present when `dialect === "postgresql"` and `url` is null.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No new errors. The `!` assertions match the Zod validation guarantees.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/config.ts
git commit -m "fix(db): URL-encode credentials in PostgreSQL connection string builder

Passwords containing URI-special characters (@, :, /, #) would produce a
malformed connection string. Apply encodeURIComponent() to user and password
fields."
```

---

### Task 3: Stabilize postgres.js integration in drizzle.ts

Three changes to `packages/db/drizzle.ts`:
1. Use public `types` API for bigint parsing instead of undocumented `client.options.parsers`
2. Add fail-fast verification for the `.changes` prototype patch
3. Store raw client in module scope and export a `close()` function

**Files:**
- Modify: `packages/db/drizzle.ts`
- Modify: `packages/db/index.ts`

- [ ] **Step 1: Refactor `createPostgresDB` — bigint via public API**

In `packages/db/drizzle.ts`, update the `createPostgresDB` function. Replace lines 72-77:

```ts
// BEFORE
  const client = pgClient(connectionString);
  // PostgreSQL COUNT/SUM return bigint (OID 20), which postgres.js delivers
  // as a string by default.  The app expects plain numbers everywhere, so
  // parse bigint results as Number.  Safe for the counts and sums used in
  // this application (well within Number.MAX_SAFE_INTEGER).
  client.options.parsers["20"] = (val: string) => Number(val);

// AFTER
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
        parse: (val: string) => Number(val),
      },
    },
  });
```

- [ ] **Step 2: Add fail-fast verification for `.changes` patch**

In the same function, after the existing `.changes` prototype-patching block (the `Object.defineProperty` block ending around line 92), add verification:

```ts
  // Verify the .changes patch works on a mutation result.
  // If postgres.js changes its Result class hierarchy, this will fail
  // immediately at startup rather than producing silent bugs at runtime.
  const verify =
    await client`CREATE TEMP TABLE IF NOT EXISTS _karakeep_verify(x int)`;
  if (typeof verify.changes !== "number") {
    throw new Error(
      "PostgreSQL .changes compatibility patch failed. " +
        "This likely means the postgres.js driver version is incompatible. " +
        `Expected numeric .changes, got ${typeof verify.changes}. ` +
        "Pin postgres to ~3.4.9 or update the patch in drizzle.ts.",
    );
  }
```

- [ ] **Step 3: Add module-scope client storage and `close()` export**

At the top of `packages/db/drizzle.ts`, after the `const __dirname` line (line 20), add:

```ts
// Raw database client, stored for graceful shutdown via close().
let _rawClient: Database.Database | ReturnType<typeof postgres> | null = null;
```

Inside `createSqliteDB()`, after `const sqlite = new SqliteDatabase(databaseURL);` (line 45), add:

```ts
  _rawClient = sqlite;
```

Inside `createPostgresDB()`, after the `const client = pgClient(...)` call (the one you just modified in Step 1), add:

```ts
  _rawClient = client;
```

At the bottom of the file, after the `getInMemoryDB` function, add:

```ts
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
```

- [ ] **Step 4: Re-export `close` from index.ts**

In `packages/db/index.ts`, update the drizzle export line:

```ts
// BEFORE
export { db, dialect } from "./drizzle";

// AFTER
export { close, db, dialect } from "./drizzle";
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: No errors. The types use existing type-only imports (`Database`, `postgres`) that are already in the file.

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: All existing tests pass. The in-memory SQLite path in `getInMemoryDB` is unchanged, and `close()` is additive.

- [ ] **Step 7: Commit**

```bash
git add packages/db/drizzle.ts packages/db/index.ts
git commit -m "fix(db): stabilize postgres.js integration and add graceful shutdown

- Use documented types constructor option for bigint parsing instead of
  reaching into client.options.parsers (undocumented internal)
- Add fail-fast verification after .changes prototype patch so incompatible
  postgres.js versions fail at startup, not silently at runtime
- Export close() for graceful database connection shutdown"
```

---

### Task 4: Replace process.exit(0) with graceful shutdown in migrate.ts

Now that `close()` is exported from drizzle, use it instead of `process.exit(0)`.

**Files:**
- Modify: `packages/db/migrate.ts`

- [ ] **Step 1: Replace process.exit(0) with close()**

Replace the full contents of `packages/db/migrate.ts`:

```ts
import type { migrate as sqliteMigrate } from "drizzle-orm/better-sqlite3/migrator";
import type { migrate as pgMigrate } from "drizzle-orm/postgres-js/migrator";

import { close, db, dialect } from "./drizzle";

if (dialect === "postgresql") {
  const { migrate } =
    (await import("drizzle-orm/postgres-js/migrator")) as unknown as {
      migrate: typeof pgMigrate;
    };
  // At runtime db is a PostgresJsDatabase instance when dialect is "postgresql"
  await migrate(db as unknown as Parameters<typeof migrate>[0], {
    migrationsFolder: "./migrations/pg",
  });
  // Close the connection so the process can exit naturally.
  // (postgres.js keeps the event loop alive if connections remain open.)
  await close();
} else {
  const { migrate } =
    (await import("drizzle-orm/better-sqlite3/migrator")) as unknown as {
      migrate: typeof sqliteMigrate;
    };
  migrate(db, {
    migrationsFolder: "./migrations/sqlite",
  });
  await close();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/db/migrate.ts
git commit -m "fix(db): replace process.exit(0) with graceful close() in migrate.ts

Uses the new close() export from drizzle.ts to shut down the database
connection cleanly, allowing the process to exit naturally instead of
calling process.exit(0) which skips cleanup handlers."
```

---

### Task 5: Add workers and prep to Docker Compose postgres overlay

The overlay currently only configures the `web` service. The dev compose file also has `workers` and `prep` services that need database access. Services not present in the base compose file are silently ignored by `docker compose`, so adding them here is safe for production compose (which only has `web`).

**Files:**
- Modify: `docker/docker-compose.postgres.yml`

- [ ] **Step 1: Add workers and prep service overrides**

Replace the full contents of `docker/docker-compose.postgres.yml`:

```yaml
# PostgreSQL overlay — combine with any base docker-compose file:
#   docker compose -f docker-compose.yml -f docker-compose.postgres.yml up
#   docker compose -f docker-compose.dev.yml -f docker-compose.postgres.yml up
#
# Set DATABASE_PASSWORD in your .env file (or export it) before starting.

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - 5432:5432
    environment:
      POSTGRES_USER: ${DATABASE_USER:-karakeep}
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD:?Set DATABASE_PASSWORD in .env}
      POSTGRES_DB: ${DATABASE_NAME:-karakeep}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DATABASE_USER:-karakeep} -d ${DATABASE_NAME:-karakeep}"]
      interval: 5s
      timeout: 5s
      retries: 5

  web:
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_DIALECT: postgresql
      DATABASE_URL: postgresql://${DATABASE_USER:-karakeep}:${DATABASE_PASSWORD}@postgres:5432/${DATABASE_NAME:-karakeep}

  workers:
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_DIALECT: postgresql
      DATABASE_URL: postgresql://${DATABASE_USER:-karakeep}:${DATABASE_PASSWORD}@postgres:5432/${DATABASE_NAME:-karakeep}

  prep:
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_DIALECT: postgresql
      DATABASE_URL: postgresql://${DATABASE_USER:-karakeep}:${DATABASE_PASSWORD}@postgres:5432/${DATABASE_NAME:-karakeep}

volumes:
  postgres_data:
```

- [ ] **Step 2: Verify overlay merges correctly with dev compose**

Run: `cd docker && docker compose -f docker-compose.dev.yml -f docker-compose.postgres.yml config 2>&1 | grep -A2 DATABASE_DIALECT`

Expected: You should see `DATABASE_DIALECT: postgresql` under the `web`, `workers`, and `prep` services.

- [ ] **Step 3: Verify overlay merges correctly with production compose (workers/prep silently ignored)**

Run: `cd docker && DATABASE_PASSWORD=test docker compose -f docker-compose.yml -f docker-compose.postgres.yml config 2>&1 | grep -c "DATABASE_DIALECT"`

Expected: Output is `1` (only the `web` service gets the env var; `workers` and `prep` don't exist in production compose so they're ignored).

- [ ] **Step 4: Commit**

```bash
git add docker/docker-compose.postgres.yml
git commit -m "fix(docker): add workers and prep to PostgreSQL compose overlay

The overlay now configures all services that need database access. Services
not present in the base compose file (e.g., workers/prep in production
compose) are silently ignored by docker compose."
```

---

### Task 6: Fix missing trailing newlines in env samples

Both `.env.sample` and `docker/.env.sample` are missing POSIX trailing newlines.

**Files:**
- Modify: `.env.sample`
- Modify: `docker/.env.sample`

- [ ] **Step 1: Add trailing newlines**

For `.env.sample`, ensure the last line (`# DATABASE_URL=...`) is followed by a newline character. The file should end as:

```
# DATABASE_URL=postgresql://user:password@host:5432/karakeep
```

(with a trailing newline after the last line)

For `docker/.env.sample`, ensure the last line (`# DATABASE_URL=...`) is followed by a newline character. Same pattern.

You can verify with: `tail -c 1 .env.sample | xxd | head -1`
Expected after fix: the last byte should be `0a` (newline).

- [ ] **Step 2: Commit**

```bash
git add .env.sample docker/.env.sample
git commit -m "fix: add trailing newlines to .env.sample files

Standard POSIX convention; prevents git diff noise on future edits."
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: Clean pass across all packages.

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass. No regressions from these changes.

- [ ] **Step 3: Run lint and format**

Run: `pnpm lint && pnpm format`
Expected: Clean pass. If format issues arise from the new code in `drizzle.ts`, fix with `pnpm format:fix`.
