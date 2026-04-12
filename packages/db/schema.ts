// Schema entry point.
//
// Conditionally re-exports from the active dialect so that Drizzle uses the
// correct column definitions at runtime.  This matters because Drizzle uses
// the table/column objects to determine how to serialize query parameters —
// e.g., SQLite stores timestamps as epoch integers, PostgreSQL uses native
// timestamps.  Exporting the wrong dialect's objects causes type mismatches
// in generated SQL.
//
// TypeScript sees the SQLite types at compile time (both schemas export
// identical table/column names, so the types are structurally compatible).
// At runtime the correct dialect's objects are exported.
//
// We read DATABASE_DIALECT directly from process.env rather than importing
// @karakeep/shared/config to avoid pulling node: modules into client-side
// webpack bundles.

import * as pgSchema from "./schema.pg";
import * as sqliteSchema from "./schema.sqlite";

const dialect = process.env.DATABASE_DIALECT ?? "sqlite";
// Cast to sqliteSchema type so TypeScript sees concrete column types.
// Both schemas export structurally identical names; the cast only affects
// compile-time types while the correct dialect's objects are used at runtime.
const s: typeof sqliteSchema =
  dialect === "postgresql"
    ? (pgSchema as unknown as typeof sqliteSchema)
    : sqliteSchema;

export const users = s.users;
export const accounts = s.accounts;
export const sessions = s.sessions;
export const verificationTokens = s.verificationTokens;
export const passwordResetTokens = s.passwordResetTokens;
export const apiKeys = s.apiKeys;
export const bookmarks = s.bookmarks;
export const bookmarkLinks = s.bookmarkLinks;
// const enum is inlined at compile time — re-export from the sqlite schema
// directly since both dialects define identical values.
export { AssetTypes } from "./schema.sqlite";
export const assets = s.assets;
export const highlights = s.highlights;
export const userReadingProgress = s.userReadingProgress;
export const bookmarkTexts = s.bookmarkTexts;
export const bookmarkAssets = s.bookmarkAssets;
export const bookmarkTags = s.bookmarkTags;
export const tagsOnBookmarks = s.tagsOnBookmarks;
export const bookmarkLists = s.bookmarkLists;
export const bookmarksInLists = s.bookmarksInLists;
export const listCollaborators = s.listCollaborators;
export const listInvitations = s.listInvitations;
export const customPrompts = s.customPrompts;
export const rssFeedsTable = s.rssFeedsTable;
export const webhooksTable = s.webhooksTable;
export const rssFeedImportsTable = s.rssFeedImportsTable;
export const backupsTable = s.backupsTable;
export const config = s.config;
export const ruleEngineRulesTable = s.ruleEngineRulesTable;
export const ruleEngineActionsTable = s.ruleEngineActionsTable;
export const invites = s.invites;
export const subscriptions = s.subscriptions;
export const importSessions = s.importSessions;
export const importSessionBookmarks = s.importSessionBookmarks;
export const importStagingBookmarks = s.importStagingBookmarks;

export * from "./schema.relations";
