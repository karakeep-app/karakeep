// Schema entry point.
//
// This always re-exports the SQLite schema types for TypeScript. Both
// schema.sqlite.ts and schema.pg.ts export identical table/column names,
// so the exported types are structurally compatible regardless of which
// dialect is active at runtime.
//
// At runtime, drizzle.ts loads the correct dialect's schema directly when
// creating the db instance (via require("./schema.pg") or
// require("./schema.sqlite")). The table objects exported here are used
// by consuming code for type-safe references in queries like
// eq(bookmarks.userId, users.id) — these work correctly at runtime because
// both schemas produce equivalent column descriptors with the same names.
export * from "./schema.sqlite";
export * from "./schema.relations";
