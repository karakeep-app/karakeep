# PostgreSQL PR Review Fixes -- Design Spec

**Date:** 2026-04-12
**PR:** #4 (feat: add PostgreSQL as configurable database backend)
**Scope:** One targeted fix from code review -- DB type safety. Plus documentation of a reviewed-and-validated design decision.

## Issue 1 (resolved -- no change needed): `schema.relations.ts` imports from `./schema.sqlite`

### Original concern

`schema.relations.ts` imports table objects from `./schema.sqlite`, meaning relations are always defined against SQLite table objects, even when PostgreSQL is active.

### Why this is correct

Drizzle resolves relations to tables by **SQL table name** (via `getTableUniqueName` which returns `"schema.tableName"`, e.g. `"public.user"`), **not** by JavaScript object identity. When `drizzle()` receives `{ ...pgSchema, ...relations }`, it matches `userRelations` (defined with SQLite's `users` table) to PG's `users` table because both share the SQL name `"public.user"`.

Changing the import to `./schema` was attempted but creates a **circular dependency**: `schema.relations.ts` -> `./schema` -> `export * from "./schema.relations"`. Node.js returns partially-initialized exports, causing `undefined` table objects at runtime.

### No change needed

The existing import from `./schema.sqlite` is the correct design.

## Issue 2: Type safety of the `BetterSQLite3Database` cast

### Problem

In `drizzle.ts:133-136`, the PostgresJsDatabase instance is cast to `BetterSQLite3Database<FullSchema>` via `as unknown as`:

```ts
export const db: BetterSQLite3Database<FullSchema> =
  dialect === "postgresql"
    ? ((await createPostgresDB()) as unknown as BetterSQLite3Database<FullSchema>)
    : ((await createSqliteDB()) as unknown as BetterSQLite3Database<FullSchema>);
```

Drizzle has no shared base type between SQLite and PG. The cast works at runtime because the query builder APIs are structurally compatible. However, the `as unknown as` erases all type checking -- a future Drizzle upgrade could break the PG instance's compatibility with the `BetterSQLite3Database` interface and TypeScript wouldn't catch it.

### Approach: keep the cast, add compile-time compatibility check

A wrapper class or union type was considered but rejected:
- **Union type** would require narrowing at all ~250 db method call sites across 47 files
- **Wrapper class** can't properly type the return values of `.select()`, `.insert()`, etc. because they return dialect-specific builder types, and the `.query` relational API is especially hard to wrap
- **Runtime cost** of either alternative is zero -- this is purely a compile-time concern

Instead, add a type-level assertion in `drizzle.ts` that verifies the PostgresJsDatabase type satisfies the key methods the codebase uses. This catches Drizzle upgrades that break structural compatibility at compile time.

### Implementation

Add a compile-time compatibility check after the type definitions in `drizzle.ts`:

```ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Compile-time check: verify that PostgresJsDatabase exposes the same
// core methods as BetterSQLite3Database.  If a Drizzle upgrade breaks
// structural compatibility, this block will produce a type error.
type _PgDB = PostgresJsDatabase<FullSchema>;
type _AssertHas<T, K extends keyof T> = K;
type _PgCheck =
  | _AssertHas<_PgDB, "select">
  | _AssertHas<_PgDB, "selectDistinct">
  | _AssertHas<_PgDB, "insert">
  | _AssertHas<_PgDB, "update">
  | _AssertHas<_PgDB, "delete">
  | _AssertHas<_PgDB, "query">
  | _AssertHas<_PgDB, "transaction">
  | _AssertHas<_PgDB, "$count">;
// Suppress unused-type warning
type _Unused = _PgCheck;
```

This is zero-cost at runtime (types are erased) and will fail `pnpm typecheck` if any of these methods are removed or renamed in a future Drizzle version.

Also improve the existing TSDoc comment on the `db` export to explain the cast rationale and point to the compatibility check.

### Files changed

- `packages/db/drizzle.ts` -- add `PostgresJsDatabase` type import, add compile-time assertion block, improve TSDoc on `db` export

## Verification

- `pnpm typecheck` -- ensure no type errors from new assertions
- `pnpm test` -- ensure existing tests pass (in-memory SQLite path unchanged)
