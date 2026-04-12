# PostgreSQL Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PostgreSQL as a configurable database backend alongside the existing SQLite default.

**Architecture:** Dual-schema approach — `schema.sqlite.ts` and `schema.pg.ts` with shared relations. A factory in `drizzle.ts` creates the appropriate driver based on `DATABASE_DIALECT` config. Error handling abstracted via predicates. Migrations stored per-dialect under `migrations/`.

**Tech Stack:** Drizzle ORM, postgres.js, better-sqlite3, Zod config validation

**Spec:** `docs/superpowers/specs/2026-04-11-postgresql-support-design.md`

---

## File Map

### New Files
- `packages/db/schema.sqlite.ts` — SQLite schema (renamed from current `schema.ts`, table definitions only)
- `packages/db/schema.pg.ts` — PostgreSQL schema (equivalent tables using `pgTable`)
- `packages/db/schema.relations.ts` — Shared relations (extracted from current `schema.ts`)
- `packages/db/errors.ts` — Dialect-agnostic error predicates (`isUniqueConstraintError`)
- `packages/db/sql-helpers.ts` — Dialect-aware raw SQL fragments (`domainFromUrl`)
- `packages/db/drizzle.config.sqlite.ts` — Drizzle Kit config for SQLite
- `packages/db/drizzle.config.pg.ts` — Drizzle Kit config for PostgreSQL
- `packages/db/scripts/migrate-to-pg.ts` — SQLite-to-PostgreSQL data migration script
- `packages/db/migrations/pg/` — PostgreSQL migration directory (baseline)
- `docs/docs/03-configuration/02-postgresql.md` — PostgreSQL setup guide

### Modified Files
- `packages/db/schema.ts` — Becomes conditional re-export entry point
- `packages/db/drizzle.ts` — Factory pattern for SQLite/PostgreSQL
- `packages/db/index.ts` — Replace `SqliteError` export with error predicates, dialect-agnostic transaction type
- `packages/db/migrate.ts` — Dialect-aware migration runner
- `packages/db/instrumentation.ts` — Add PostgreSQL instrumentation function
- `packages/db/package.json` — Add `postgres` dependency
- `packages/db/drizzle.config.ts` — Remove (replaced by per-dialect configs)
- `packages/shared/config.ts` — Add `DATABASE_DIALECT`, `DATABASE_URL`, `DATABASE_HOST/PORT/USER/PASSWORD/NAME`
- `packages/trpc/models/users.ts` — Use `isUniqueConstraintError`, use `domainFromUrl` helper
- `packages/trpc/models/tags.ts` — Use `isUniqueConstraintError`
- `packages/trpc/models/lists.ts` — Use `isUniqueConstraintError`
- `docs/docs/03-configuration/01-environment-variables.md` — Document new env vars

### Moved Files
- `packages/db/drizzle/*` → `packages/db/migrations/sqlite/` (existing SQLite migrations)

---

## Task 1: Add Database Configuration

**Files:**
- Modify: `packages/shared/config.ts:19-238` (allEnv schema) and `:440-479` (serverConfigSchema transform + validation)
- Modify: `.env.sample`
- Modify: `docker/.env.sample`

- [ ] **Step 1: Add env var definitions to the Zod schema**

In `packages/shared/config.ts`, add the new database env vars after the existing `DB_WAL_MODE` line (line 231):

```typescript
  // Database configuration
  DATABASE_DIALECT: z.enum(["sqlite", "postgresql"]).default("sqlite"),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().default(5432),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  DB_WAL_MODE: stringBool("false"),
```

- [ ] **Step 2: Update the serverConfigSchema transform**

Replace the `database` section (lines 452-454) with:

```typescript
    database: {
      dialect: val.DATABASE_DIALECT,
      url: val.DATABASE_URL ?? null,
      host: val.DATABASE_HOST ?? null,
      port: val.DATABASE_PORT,
      user: val.DATABASE_USER ?? null,
      password: val.DATABASE_PASSWORD ?? null,
      name: val.DATABASE_NAME ?? null,
      walMode: val.DB_WAL_MODE,
    },
```

- [ ] **Step 3: Add validation for PostgreSQL connection requirements**

After the existing turnstile validation block (around line 478), add:

```typescript
  if (obj.database.dialect === "postgresql") {
    const hasUrl = !!obj.database.url;
    const hasFields = !!(obj.database.host && obj.database.user && obj.database.password && obj.database.name);
    if (!hasUrl && !hasFields) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "PostgreSQL requires either DATABASE_URL or DATABASE_HOST + DATABASE_USER + DATABASE_PASSWORD + DATABASE_NAME",
        fatal: true,
      });
      return z.NEVER;
    }
    if (hasUrl && hasFields) {
      console.warn(
        "Both DATABASE_URL and individual DATABASE_* fields are set. DATABASE_URL takes precedence.",
      );
    }
  }
```

- [ ] **Step 4: Update .env.sample files**

In `.env.sample`, add:

```
# See https://docs.karakeep.app/configuration for more information
DATA_DIR=<path>
NEXTAUTH_SECRET=<secret>

# Database (optional, defaults to SQLite)
# DATABASE_DIALECT=postgresql
# DATABASE_URL=postgresql://user:password@host:5432/karakeep
```

In `docker/.env.sample`, add after the existing content:

```
# Database (optional, defaults to SQLite)
# DATABASE_DIALECT=postgresql
# DATABASE_URL=postgresql://user:password@host:5432/karakeep
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (no type errors)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/config.ts .env.sample docker/.env.sample
git commit -m "feat(db): add DATABASE_DIALECT and PostgreSQL connection config"
```

---

## Task 2: Move SQLite Migrations to New Directory

**Files:**
- Move: `packages/db/drizzle/*` → `packages/db/migrations/sqlite/`
- Modify: `packages/db/drizzle.ts:35` (migrationsFolder path)

- [ ] **Step 1: Move existing migrations**

```bash
cd packages/db
mkdir -p migrations/sqlite
mv drizzle/meta migrations/sqlite/meta
mv drizzle/*.sql migrations/sqlite/
rmdir drizzle
```

- [ ] **Step 2: Update getInMemoryDB migrationsFolder path**

In `packages/db/drizzle.ts`, change line 35 from:

```typescript
    migrate(db, { migrationsFolder: path.resolve(__dirname, "./drizzle") });
```

To:

```typescript
    migrate(db, { migrationsFolder: path.resolve(__dirname, "./migrations/sqlite") });
```

- [ ] **Step 3: Update drizzle.config.ts output path**

In `packages/db/drizzle.config.ts`, change line 14 from:

```typescript
  out: "./drizzle",
```

To:

```typescript
  out: "./migrations/sqlite",
```

- [ ] **Step 4: Update migrate.ts migrationsFolder path**

In `packages/db/migrate.ts`, change from:

```typescript
migrate(db, { migrationsFolder: "./drizzle" });
```

To:

```typescript
migrate(db, { migrationsFolder: "./migrations/sqlite" });
```

- [ ] **Step 5: Run tests to verify migrations still work**

Run: `pnpm test`
Expected: PASS (all existing tests pass with new migration path)

- [ ] **Step 6: Commit**

```bash
git add packages/db/migrations/sqlite packages/db/drizzle.ts packages/db/drizzle.config.ts packages/db/migrate.ts
git rm -r packages/db/drizzle
git commit -m "refactor(db): move SQLite migrations to migrations/sqlite/"
```

---

## Task 3: Extract Relations into Shared File

**Files:**
- Create: `packages/db/schema.relations.ts`
- Modify: `packages/db/schema.ts:962-1221` (remove relations, add re-export)

- [ ] **Step 1: Create schema.relations.ts**

Create `packages/db/schema.relations.ts` with the relation definitions extracted from `schema.ts`. The relations import table objects from `./schema.sqlite` (the current dialect file, which will be created in the next task — for now, import from `./schema` since it still has the tables):

```typescript
import { relations } from "drizzle-orm";

import {
  accounts,
  apiKeys,
  assets,
  backupsTable,
  bookmarkAssets,
  bookmarkLinks,
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  bookmarkTexts,
  highlights,
  importSessionBookmarks,
  importSessions,
  invites,
  listCollaborators,
  listInvitations,
  passwordResetTokens,
  rssFeedImportsTable,
  rssFeedsTable,
  ruleEngineActionsTable,
  ruleEngineRulesTable,
  subscriptions,
  tagsOnBookmarks,
  userReadingProgress,
  users,
  webhooksTable,
} from "./schema";

export const userRelations = relations(users, ({ many, one }) => ({
  tags: many(bookmarkTags),
  bookmarks: many(bookmarks),
  webhooks: many(webhooksTable),
  rules: many(ruleEngineRulesTable),
  invites: many(invites),
  subscription: one(subscriptions),
  importSessions: many(importSessions),
  listCollaborations: many(listCollaborators),
  backups: many(backupsTable),
  listInvitations: many(listInvitations),
}));

export const bookmarkRelations = relations(bookmarks, ({ many, one }) => ({
  user: one(users, {
    fields: [bookmarks.userId],
    references: [users.id],
  }),
  link: one(bookmarkLinks, {
    fields: [bookmarks.id],
    references: [bookmarkLinks.id],
  }),
  text: one(bookmarkTexts, {
    fields: [bookmarks.id],
    references: [bookmarkTexts.id],
  }),
  asset: one(bookmarkAssets, {
    fields: [bookmarks.id],
    references: [bookmarkAssets.id],
  }),
  tagsOnBookmarks: many(tagsOnBookmarks),
  bookmarksInLists: many(bookmarksInLists),
  assets: many(assets),
  rssFeeds: many(rssFeedImportsTable),
  importSessionBookmarks: many(importSessionBookmarks),
}));

export const assetRelations = relations(assets, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [assets.bookmarkId],
    references: [bookmarks.id],
  }),
}));

export const bookmarkTagsRelations = relations(
  bookmarkTags,
  ({ many, one }) => ({
    user: one(users, {
      fields: [bookmarkTags.userId],
      references: [users.id],
    }),
    tagsOnBookmarks: many(tagsOnBookmarks),
  }),
);

export const tagsOnBookmarksRelations = relations(
  tagsOnBookmarks,
  ({ one }) => ({
    tag: one(bookmarkTags, {
      fields: [tagsOnBookmarks.tagId],
      references: [bookmarkTags.id],
    }),
    bookmark: one(bookmarks, {
      fields: [tagsOnBookmarks.bookmarkId],
      references: [bookmarks.id],
    }),
  }),
);

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const bookmarkListsRelations = relations(
  bookmarkLists,
  ({ one, many }) => ({
    bookmarksInLists: many(bookmarksInLists),
    collaborators: many(listCollaborators),
    invitations: many(listInvitations),
    user: one(users, {
      fields: [bookmarkLists.userId],
      references: [users.id],
    }),
    parent: one(bookmarkLists, {
      fields: [bookmarkLists.parentId],
      references: [bookmarkLists.id],
    }),
  }),
);

export const bookmarksInListsRelations = relations(
  bookmarksInLists,
  ({ one }) => ({
    bookmark: one(bookmarks, {
      fields: [bookmarksInLists.bookmarkId],
      references: [bookmarks.id],
    }),
    list: one(bookmarkLists, {
      fields: [bookmarksInLists.listId],
      references: [bookmarkLists.id],
    }),
  }),
);

export const listCollaboratorsRelations = relations(
  listCollaborators,
  ({ one }) => ({
    list: one(bookmarkLists, {
      fields: [listCollaborators.listId],
      references: [bookmarkLists.id],
    }),
    user: one(users, {
      fields: [listCollaborators.userId],
      references: [users.id],
    }),
    addedByUser: one(users, {
      fields: [listCollaborators.addedBy],
      references: [users.id],
    }),
  }),
);

export const listInvitationsRelations = relations(
  listInvitations,
  ({ one }) => ({
    list: one(bookmarkLists, {
      fields: [listInvitations.listId],
      references: [bookmarkLists.id],
    }),
    user: one(users, {
      fields: [listInvitations.userId],
      references: [users.id],
    }),
    invitedByUser: one(users, {
      fields: [listInvitations.invitedBy],
      references: [users.id],
    }),
  }),
);

export const webhooksRelations = relations(webhooksTable, ({ one }) => ({
  user: one(users, {
    fields: [webhooksTable.userId],
    references: [users.id],
  }),
}));

export const ruleEngineRulesRelations = relations(
  ruleEngineRulesTable,
  ({ one, many }) => ({
    user: one(users, {
      fields: [ruleEngineRulesTable.userId],
      references: [users.id],
    }),
    actions: many(ruleEngineActionsTable),
  }),
);

export const ruleEngineActionsTableRelations = relations(
  ruleEngineActionsTable,
  ({ one }) => ({
    rule: one(ruleEngineRulesTable, {
      fields: [ruleEngineActionsTable.ruleId],
      references: [ruleEngineRulesTable.id],
    }),
  }),
);

export const rssFeedImportsTableRelations = relations(
  rssFeedImportsTable,
  ({ one }) => ({
    rssFeed: one(rssFeedsTable, {
      fields: [rssFeedImportsTable.rssFeedId],
      references: [rssFeedsTable.id],
    }),
    bookmark: one(bookmarks, {
      fields: [rssFeedImportsTable.bookmarkId],
      references: [bookmarks.id],
    }),
  }),
);

export const invitesRelations = relations(invites, ({ one }) => ({
  invitedBy: one(users, {
    fields: [invites.invitedBy],
    references: [users.id],
  }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const importSessionsRelations = relations(
  importSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [importSessions.userId],
      references: [users.id],
    }),
    bookmarks: many(importSessionBookmarks),
  }),
);

export const importSessionBookmarksRelations = relations(
  importSessionBookmarks,
  ({ one }) => ({
    importSession: one(importSessions, {
      fields: [importSessionBookmarks.importSessionId],
      references: [importSessions.id],
    }),
    bookmark: one(bookmarks, {
      fields: [importSessionBookmarks.bookmarkId],
      references: [bookmarks.id],
    }),
  }),
);

export const backupsRelations = relations(backupsTable, ({ one }) => ({
  user: one(users, {
    fields: [backupsTable.userId],
    references: [users.id],
  }),
  asset: one(assets, {
    fields: [backupsTable.assetId],
    references: [assets.id],
  }),
}));

export const userReadingProgressRelations = relations(
  userReadingProgress,
  ({ one }) => ({
    bookmark: one(bookmarks, {
      fields: [userReadingProgress.bookmarkId],
      references: [bookmarks.id],
    }),
    user: one(users, {
      fields: [userReadingProgress.userId],
      references: [users.id],
    }),
  }),
);
```

- [ ] **Step 2: Remove relations from schema.ts and add re-export**

In `packages/db/schema.ts`, delete everything from line 962 (`// Relations`) through line 1221 (end of file), and add:

```typescript
// Relations
export * from "./schema.relations";
```

- [ ] **Step 3: Run tests to verify relations still work**

Run: `pnpm test`
Expected: PASS (all existing tests pass)

- [ ] **Step 4: Commit**

```bash
git add packages/db/schema.relations.ts packages/db/schema.ts
git commit -m "refactor(db): extract relations into schema.relations.ts"
```

---

## Task 4: Rename schema.ts to schema.sqlite.ts and Create Entry Point

**Files:**
- Rename: `packages/db/schema.ts` → `packages/db/schema.sqlite.ts`
- Create: `packages/db/schema.ts` (new entry point)
- Modify: `packages/db/schema.relations.ts` (update import path)

- [ ] **Step 1: Rename schema.ts to schema.sqlite.ts**

```bash
cd packages/db
git mv schema.ts schema.sqlite.ts
```

- [ ] **Step 2: Update schema.relations.ts import**

In `packages/db/schema.relations.ts`, change the import from:

```typescript
} from "./schema";
```

To:

```typescript
} from "./schema.sqlite";
```

Note: This will be updated again in Task 7 to import conditionally. For now, importing from the SQLite schema keeps everything working.

- [ ] **Step 3: Create schema.ts entry point**

Create `packages/db/schema.ts`:

```typescript
export * from "./schema.sqlite";
export * from "./schema.relations";
```

Note: This file will be updated in Task 7 to conditionally export from the active dialect. For now, it re-exports SQLite only.

- [ ] **Step 4: Run tests to verify everything still works**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/schema.ts packages/db/schema.sqlite.ts packages/db/schema.relations.ts
git commit -m "refactor(db): rename schema to schema.sqlite.ts with entry point"
```

---

## Task 5: Create PostgreSQL Schema

**Files:**
- Create: `packages/db/schema.pg.ts`

- [ ] **Step 1: Create the PostgreSQL schema file**

Create `packages/db/schema.pg.ts`. This is the PostgreSQL equivalent of `schema.sqlite.ts`, using `pgTable` and PostgreSQL-native column types. The file mirrors every table, index, and constraint from the SQLite schema with the column type mappings from the spec.

Key differences from `schema.sqlite.ts`:
- Import from `drizzle-orm/pg-core` instead of `drizzle-orm/sqlite-core`
- `pgTable` instead of `sqliteTable`
- `timestamp("col", { withTimezone: true })` instead of `integer("col", { mode: "timestamp" })`
- `timestamp("col", { withTimezone: true, mode: "date" })` instead of `integer("col", { mode: "timestamp_ms" })`
- `boolean("col")` instead of `integer("col", { mode: "boolean" })`
- `doublePrecision("col")` instead of `real("col")`
- `jsonb("col")` instead of `text("col", { mode: "json" })`
- `AnyPgColumn` instead of `AnySQLiteColumn`

```typescript
import type { AdapterAccount } from "@auth/core/adapters";
import { createId } from "@paralleldrive/cuid2";
import { sql, SQL } from "drizzle-orm";
import {
  AnyPgColumn,
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

function createdAtField() {
  return timestamp("createdAt", { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date());
}

function modifiedAtField() {
  return timestamp("modifiedAt", { withTimezone: true })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
}

export const users = pgTable("user", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  password: text("password"),
  salt: text("salt").notNull().default(""),
  role: text("role", { enum: ["admin", "user"] }).default("user"),

  // Admin Only Settings
  bookmarkQuota: integer("bookmarkQuota"),
  storageQuota: integer("storageQuota"),
  browserCrawlingEnabled: boolean("browserCrawlingEnabled"),

  // User Settings
  bookmarkClickAction: text("bookmarkClickAction", {
    enum: ["open_original_link", "expand_bookmark_preview"],
  })
    .notNull()
    .default("open_original_link"),
  archiveDisplayBehaviour: text("archiveDisplayBehaviour", {
    enum: ["show", "hide"],
  })
    .notNull()
    .default("show"),
  timezone: text("timezone").default("UTC"),

  // Backup Settings
  backupsEnabled: boolean("backupsEnabled")
    .notNull()
    .default(false),
  backupsFrequency: text("backupsFrequency", {
    enum: ["daily", "weekly"],
  })
    .notNull()
    .default("weekly"),
  backupsRetentionDays: integer("backupsRetentionDays").notNull().default(30),

  // Reader view settings
  readerFontSize: integer("readerFontSize"),
  readerLineHeight: doublePrecision("readerLineHeight"),
  readerFontFamily: text("readerFontFamily", {
    enum: ["serif", "sans", "mono"],
  }),

  // AI Settings
  autoTaggingEnabled: boolean("autoTaggingEnabled"),
  autoSummarizationEnabled: boolean("autoSummarizationEnabled"),
  tagStyle: text("tagStyle", {
    enum: [
      "lowercase-hyphens",
      "lowercase-spaces",
      "lowercase-underscores",
      "titlecase-spaces",
      "titlecase-hyphens",
      "camelCase",
      "as-generated",
    ],
  }).default("titlecase-spaces"),
  curatedTagIds: jsonb("curatedTagIds").$type<string[]>(),
  inferredTagLang: text("inferredTagLang"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const passwordResetTokens = pgTable(
  "passwordResetToken",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: createdAtField(),
  },
  (prt) => [index("passwordResetTokens_userId_idx").on(prt.userId)],
);

export const apiKeys = pgTable(
  "apiKey",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    createdAt: createdAtField(),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    keyId: text("keyId").notNull().unique(),
    keyHash: text("keyHash").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (ak) => [unique().on(ak.name, ak.userId)],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
    title: text("title"),
    archived: boolean("archived").notNull().default(false),
    favourited: boolean("favourited")
      .notNull()
      .default(false),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taggingStatus: text("taggingStatus", {
      enum: ["pending", "failure", "success"],
    }).default("pending"),
    summarizationStatus: text("summarizationStatus", {
      enum: ["pending", "failure", "success"],
    }).default("pending"),
    summary: text("summary"),
    note: text("note"),
    type: text("type", {
      enum: [BookmarkTypes.LINK, BookmarkTypes.TEXT, BookmarkTypes.ASSET],
    }).notNull(),
    source: text("source", {
      enum: [
        "api",
        "web",
        "extension",
        "cli",
        "mobile",
        "singlefile",
        "rss",
        "import",
      ],
    }),
  },
  (b) => [
    index("bookmarks_userId_idx").on(b.userId),
    index("bookmarks_createdAt_idx").on(b.createdAt),
    index("bookmarks_userId_createdAt_id_idx").on(b.userId, b.createdAt, b.id),
    index("bookmarks_userId_archived_createdAt_id_idx").on(
      b.userId,
      b.archived,
      b.createdAt,
      b.id,
    ),
    index("bookmarks_userId_favourited_createdAt_id_idx").on(
      b.userId,
      b.favourited,
      b.createdAt,
      b.id,
    ),
  ],
);

export const bookmarkLinks = pgTable(
  "bookmarkLinks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId())
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    author: text("author"),
    publisher: text("publisher"),
    datePublished: timestamp("datePublished", { withTimezone: true }),
    dateModified: timestamp("dateModified", { withTimezone: true }),
    imageUrl: text("imageUrl"),
    favicon: text("favicon"),
    htmlContent: text("htmlContent"),
    contentAssetId: text("contentAssetId"),
    crawledAt: timestamp("crawledAt", { withTimezone: true }),
    crawlStatus: text("crawlStatus", {
      enum: ["pending", "failure", "success"],
    }).default("pending"),
    crawlStatusCode: integer("crawlStatusCode").default(200),
  },
  (bl) => [index("bookmarkLinks_url_idx").on(bl.url)],
);

export const enum AssetTypes {
  LINK_BANNER_IMAGE = "linkBannerImage",
  LINK_SCREENSHOT = "linkScreenshot",
  LINK_PDF = "linkPdf",
  ASSET_SCREENSHOT = "assetScreenshot",
  LINK_FULL_PAGE_ARCHIVE = "linkFullPageArchive",
  LINK_PRECRAWLED_ARCHIVE = "linkPrecrawledArchive",
  LINK_VIDEO = "linkVideo",
  LINK_HTML_CONTENT = "linkHtmlContent",
  BOOKMARK_ASSET = "bookmarkAsset",
  USER_UPLOADED = "userUploaded",
  AVATAR = "avatar",
  BACKUP = "backup",
  UNKNOWN = "unknown",
}

export const assets = pgTable(
  "assets",
  {
    id: text("id").notNull().primaryKey(),
    assetType: text("assetType", {
      enum: [
        AssetTypes.LINK_BANNER_IMAGE,
        AssetTypes.LINK_SCREENSHOT,
        AssetTypes.LINK_PDF,
        AssetTypes.ASSET_SCREENSHOT,
        AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        AssetTypes.LINK_PRECRAWLED_ARCHIVE,
        AssetTypes.LINK_VIDEO,
        AssetTypes.LINK_HTML_CONTENT,
        AssetTypes.BOOKMARK_ASSET,
        AssetTypes.USER_UPLOADED,
        AssetTypes.AVATAR,
        AssetTypes.BACKUP,
        AssetTypes.UNKNOWN,
      ],
    }).notNull(),
    size: integer("size").notNull().default(0),
    contentType: text("contentType"),
    fileName: text("fileName"),
    bookmarkId: text("bookmarkId").references(() => bookmarks.id, {
      onDelete: "cascade",
    }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (tb) => [
    index("assets_bookmarkId_idx").on(tb.bookmarkId),
    index("assets_assetType_idx").on(tb.assetType),
    index("assets_userId_idx").on(tb.userId),
  ],
);

export const highlights = pgTable(
  "highlights",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, {
        onDelete: "cascade",
      }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startOffset: integer("startOffset").notNull(),
    endOffset: integer("endOffset").notNull(),
    color: text("color", {
      enum: ["red", "green", "blue", "yellow"],
    })
      .default("yellow")
      .notNull(),
    text: text("text"),
    note: text("note"),
    createdAt: createdAtField(),
  },
  (tb) => [
    index("highlights_bookmarkId_idx").on(tb.bookmarkId),
    index("highlights_userId_idx").on(tb.userId),
  ],
);

export const userReadingProgress = pgTable(
  "userReadingProgress",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, {
        onDelete: "cascade",
      }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readingProgressOffset: integer("readingProgressOffset").notNull(),
    readingProgressAnchor: text("readingProgressAnchor"),
    readingProgressPercent: integer("readingProgressPercent"),
    modifiedAt: modifiedAtField(),
  },
  (tb) => [
    unique().on(tb.bookmarkId, tb.userId),
    index("userReadingProgress_bookmarkId_idx").on(tb.bookmarkId),
    index("userReadingProgress_userId_idx").on(tb.userId),
  ],
);

export const bookmarkTexts = pgTable("bookmarkTexts", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId())
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  text: text("text"),
  sourceUrl: text("sourceUrl"),
});

export const bookmarkAssets = pgTable("bookmarkAssets", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId())
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  assetType: text("assetType", { enum: ["image", "pdf"] }).notNull(),
  assetId: text("assetId").notNull(),
  content: text("content"),
  metadata: text("metadata"),
  fileName: text("fileName"),
  sourceUrl: text("sourceUrl"),
});

export const bookmarkTags = pgTable(
  "bookmarkTags",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    normalizedName: text("normalizedName").generatedAlwaysAs(
      (): SQL =>
        sql`lower(replace(replace(replace(${bookmarkTags.name}, ' ', ''), '-', ''), '_', ''))`,
      {
        mode: "stored",
      },
    ),
    createdAt: createdAtField(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (bt) => [
    unique().on(bt.userId, bt.name),
    unique("bookmarkTags_userId_id_idx").on(bt.userId, bt.id),
    index("bookmarkTags_name_idx").on(bt.name),
    index("bookmarkTags_userId_idx").on(bt.userId),
    index("bookmarkTags_normalizedName_idx").on(bt.normalizedName),
  ],
);

export const tagsOnBookmarks = pgTable(
  "tagsOnBookmarks",
  {
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: text("tagId")
      .notNull()
      .references(() => bookmarkTags.id, { onDelete: "cascade" }),
    attachedAt: timestamp("attachedAt", { withTimezone: true }).$defaultFn(
      () => new Date(),
    ),
    attachedBy: text("attachedBy", { enum: ["ai", "human"] }).notNull(),
  },
  (tb) => [
    primaryKey({ columns: [tb.bookmarkId, tb.tagId] }),
    index("tagsOnBookmarks_tagId_idx").on(tb.tagId),
    index("tagsOnBookmarks_bookmarkId_idx").on(tb.bookmarkId),
    index("tagsOnBookmarks_tagId_bookmarkId_idx").on(tb.tagId, tb.bookmarkId),
  ],
);

export const bookmarkLists = pgTable(
  "bookmarkLists",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").notNull(),
    createdAt: createdAtField(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["manual", "smart"] }).notNull(),
    query: text("query"),
    parentId: text("parentId").references(
      (): AnyPgColumn => bookmarkLists.id,
      { onDelete: "set null" },
    ),
    rssToken: text("rssToken"),
    public: boolean("public").notNull().default(false),
  },
  (bl) => [
    index("bookmarkLists_userId_idx").on(bl.userId),
    unique("bookmarkLists_userId_id_idx").on(bl.userId, bl.id),
  ],
);

export const bookmarksInLists = pgTable(
  "bookmarksInLists",
  {
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    listId: text("listId")
      .notNull()
      .references(() => bookmarkLists.id, { onDelete: "cascade" }),
    addedAt: timestamp("addedAt", { withTimezone: true }).$defaultFn(
      () => new Date(),
    ),
    listMembershipId: text("listMembershipId").references(
      () => listCollaborators.id,
      {
        onDelete: "cascade",
      },
    ),
  },
  (tb) => [
    primaryKey({ columns: [tb.bookmarkId, tb.listId] }),
    index("bookmarksInLists_bookmarkId_idx").on(tb.bookmarkId),
    index("bookmarksInLists_listId_idx").on(tb.listId),
    index("bookmarksInLists_listId_bookmarkId_idx").on(
      tb.listId,
      tb.bookmarkId,
    ),
  ],
);

export const listCollaborators = pgTable(
  "listCollaborators",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    listId: text("listId")
      .notNull()
      .references(() => bookmarkLists.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    addedAt: createdAtField(),
    addedBy: text("addedBy").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (lc) => [
    unique().on(lc.listId, lc.userId),
    index("listCollaborators_listId_idx").on(lc.listId),
    index("listCollaborators_userId_idx").on(lc.userId),
  ],
);

export const listInvitations = pgTable(
  "listInvitations",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    listId: text("listId")
      .notNull()
      .references(() => bookmarkLists.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["viewer", "editor"] }).notNull(),
    status: text("status", { enum: ["pending", "declined"] })
      .notNull()
      .default("pending"),
    invitedAt: timestamp("invitedAt", { withTimezone: true })
      .notNull()
      .$defaultFn(() => new Date()),
    invitedEmail: text("invitedEmail"),
    invitedBy: text("invitedBy").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (li) => [
    unique().on(li.listId, li.userId),
    index("listInvitations_listId_idx").on(li.listId),
    index("listInvitations_userId_idx").on(li.userId),
    index("listInvitations_status_idx").on(li.status),
  ],
);

export const customPrompts = pgTable(
  "customPrompts",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    text: text("text").notNull(),
    enabled: boolean("enabled").notNull(),
    appliesTo: text("appliesTo", {
      enum: ["all_tagging", "text", "images", "summary"],
    }).notNull(),
    createdAt: createdAtField(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (bl) => [index("customPrompts_userId_idx").on(bl.userId)],
);

export const rssFeedsTable = pgTable(
  "rssFeeds",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    url: text("url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    importTags: boolean("importTags")
      .notNull()
      .default(false),
    createdAt: createdAtField(),
    lastFetchedAt: timestamp("lastFetchedAt", { withTimezone: true }),
    lastSuccessfulFetchAt: timestamp("lastSuccessfulFetchAt", {
      withTimezone: true,
    }),
    lastFetchedStatus: text("lastFetchedStatus", {
      enum: ["pending", "failure", "success"],
    }).default("pending"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (bl) => [index("rssFeeds_userId_idx").on(bl.userId)],
);

export const webhooksTable = pgTable(
  "webhooks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    url: text("url").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    events: jsonb("events")
      .notNull()
      .$type<("created" | "edited" | "crawled" | "ai tagged" | "deleted")[]>(),
    token: text("token"),
  },
  (bl) => [index("webhooks_userId_idx").on(bl.userId)],
);

export const rssFeedImportsTable = pgTable(
  "rssFeedImports",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    entryId: text("entryId").notNull(),
    rssFeedId: text("rssFeedId")
      .notNull()
      .references(() => rssFeedsTable.id, { onDelete: "cascade" }),
    bookmarkId: text("bookmarkId").references(() => bookmarks.id, {
      onDelete: "set null",
    }),
  },
  (bl) => [
    index("rssFeedImports_feedIdIdx_idx").on(bl.rssFeedId),
    index("rssFeedImports_entryIdIdx_idx").on(bl.entryId),
    unique().on(bl.rssFeedId, bl.entryId),
    index("rssFeedImports_rssFeedId_bookmarkId_idx").on(
      bl.rssFeedId,
      bl.bookmarkId,
    ),
  ],
);

export const backupsTable = pgTable(
  "backups",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetId: text("assetId").references(() => assets.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAtField(),
    size: integer("size").notNull(),
    bookmarkCount: integer("bookmarkCount").notNull(),
    status: text("status", {
      enum: ["pending", "success", "failure"],
    })
      .notNull()
      .default("pending"),
    errorMessage: text("errorMessage"),
  },
  (b) => [
    index("backups_userId_idx").on(b.userId),
    index("backups_createdAt_idx").on(b.createdAt),
  ],
);

export const config = pgTable("config", {
  key: text("key").notNull().primaryKey(),
  value: text("value").notNull(),
});

export const ruleEngineRulesTable = pgTable(
  "ruleEngineRules",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    enabled: boolean("enabled").notNull().default(true),
    name: text("name").notNull(),
    description: text("description"),
    event: text("event").notNull(),
    condition: text("condition").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listId: text("listId"),
    tagId: text("tagId"),
  },
  (rl) => [
    index("ruleEngine_userId_idx").on(rl.userId),
    foreignKey({
      columns: [rl.userId, rl.tagId],
      foreignColumns: [bookmarkTags.userId, bookmarkTags.id],
      name: "ruleEngineRules_userId_tagId_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [rl.userId, rl.listId],
      foreignColumns: [bookmarkLists.userId, bookmarkLists.id],
      name: "ruleEngineRules_userId_listId_fk",
    }).onDelete("cascade"),
  ],
);

export const ruleEngineActionsTable = pgTable(
  "ruleEngineActions",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ruleId: text("ruleId")
      .notNull()
      .references(() => ruleEngineRulesTable.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    listId: text("listId"),
    tagId: text("tagId"),
  },
  (rl) => [
    index("ruleEngineActions_userId_idx").on(rl.userId),
    index("ruleEngineActions_ruleId_idx").on(rl.ruleId),
    foreignKey({
      columns: [rl.userId, rl.tagId],
      foreignColumns: [bookmarkTags.userId, bookmarkTags.id],
      name: "ruleEngineActions_userId_tagId_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [rl.userId, rl.listId],
      foreignColumns: [bookmarkLists.userId, bookmarkLists.id],
      name: "ruleEngineActions_userId_listId_fk",
    }).onDelete("cascade"),
  ],
);

export const invites = pgTable("invites", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAtField(),
  usedAt: timestamp("usedAt", { withTimezone: true }),
  invitedBy: text("invitedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique(),
    stripeCustomerId: text("stripeCustomerId").notNull(),
    stripeSubscriptionId: text("stripeSubscriptionId"),
    status: text("status", {
      enum: [
        "active",
        "canceled",
        "past_due",
        "unpaid",
        "incomplete",
        "trialing",
        "incomplete_expired",
        "paused",
      ],
    }).notNull(),
    tier: text("tier", {
      enum: ["free", "paid"],
    })
      .notNull()
      .default("free"),
    priceId: text("priceId"),
    cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false),
    startDate: timestamp("startDate", { withTimezone: true }),
    endDate: timestamp("endDate", { withTimezone: true }),
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
  },
  (s) => [
    index("subscriptions_userId_idx").on(s.userId),
    index("subscriptions_stripeCustomerId_idx").on(s.stripeCustomerId),
  ],
);

export const importSessions = pgTable(
  "importSessions",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message"),
    rootListId: text("rootListId").references(() => bookmarkLists.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["staging", "pending", "running", "paused", "completed", "failed"],
    })
      .notNull()
      .default("staging"),
    lastProcessedAt: timestamp("lastProcessedAt", { withTimezone: true }),
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
  },
  (is) => [
    index("importSessions_userId_idx").on(is.userId),
    index("importSessions_status_idx").on(is.status),
  ],
);

export const importSessionBookmarks = pgTable(
  "importSessionBookmarks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    importSessionId: text("importSessionId")
      .notNull()
      .references(() => importSessions.id, { onDelete: "cascade" }),
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    createdAt: createdAtField(),
  },
  (isb) => [
    index("importSessionBookmarks_sessionId_idx").on(isb.importSessionId),
    index("importSessionBookmarks_bookmarkId_idx").on(isb.bookmarkId),
    unique().on(isb.importSessionId, isb.bookmarkId),
  ],
);

export const importStagingBookmarks = pgTable(
  "importStagingBookmarks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    importSessionId: text("importSessionId")
      .notNull()
      .references(() => importSessions.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["link", "text", "asset"] }).notNull(),
    url: text("url"),
    title: text("title"),
    content: text("content"),
    note: text("note"),
    tags: jsonb("tags").$type<string[]>(),
    listIds: jsonb("listIds").$type<string[]>(),
    sourceAddedAt: timestamp("sourceAddedAt", { withTimezone: true }),
    archived: boolean("archived"),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    processingStartedAt: timestamp("processingStartedAt", {
      withTimezone: true,
    }),
    result: text("result", {
      enum: ["accepted", "rejected", "skipped_duplicate"],
    }),
    resultReason: text("resultReason"),
    resultBookmarkId: text("resultBookmarkId").references(() => bookmarks.id, {
      onDelete: "set null",
    }),
    createdAt: createdAtField(),
    completedAt: timestamp("completedAt", { withTimezone: true }),
  },
  (isb) => [
    index("importStaging_session_status_idx").on(
      isb.importSessionId,
      isb.status,
    ),
    index("importStaging_completedAt_idx").on(isb.completedAt),
    index("importStaging_status_idx").on(isb.status),
    index("importStaging_status_processingStartedAt_idx").on(
      isb.status,
      isb.processingStartedAt,
    ),
  ],
);
```

Note: The `normalizedName` generated column in `bookmarkTags` uses `mode: "stored"` instead of `mode: "virtual"` because PostgreSQL only supports stored generated columns, not virtual ones. The SQL expression `lower(replace(replace(replace(...))))` is standard SQL and works in both dialects.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (the PG schema file should type-check independently — it's not wired into the entry point yet)

- [ ] **Step 3: Commit**

```bash
git add packages/db/schema.pg.ts
git commit -m "feat(db): add PostgreSQL schema (schema.pg.ts)"
```

---

## Task 6: Create Error Abstraction

**Files:**
- Create: `packages/db/errors.ts`
- Modify: `packages/db/index.ts:10` (replace SqliteError export)
- Modify: `packages/trpc/models/users.ts:6,129-139`
- Modify: `packages/trpc/models/tags.ts:16,73-81,372-383`
- Modify: `packages/trpc/models/lists.ts:6,962-973`

- [ ] **Step 1: Create errors.ts**

Create `packages/db/errors.ts`:

```typescript
import { SqliteError } from "better-sqlite3";

export function isUniqueConstraintError(e: unknown): boolean {
  // SQLite: SQLITE_CONSTRAINT_UNIQUE or SQLITE_CONSTRAINT_PRIMARYKEY
  if (e instanceof SqliteError) {
    return (
      e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
      e.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
    );
  }
  // PostgreSQL (postgres.js): error code "23505" is unique_violation
  if (
    e != null &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code: string }).code === "23505"
  ) {
    return true;
  }
  return false;
}
```

- [ ] **Step 2: Update packages/db/index.ts**

Replace the entire file content of `packages/db/index.ts` with:

```typescript
import Database from "better-sqlite3";
import { ExtractTablesWithRelations } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import * as schema from "./schema";

export { db } from "./drizzle";
export type { DB } from "./drizzle";
export * as schema from "./schema";
export { isUniqueConstraintError } from "./errors";

// Temporarily keep the SQLite-specific transaction type.
// This will be replaced with a dialect-agnostic type in Task 8.
export type KarakeepDBTransaction = SQLiteTransaction<
  "sync",
  Database.RunResult,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
```

Note: The `KarakeepDBTransaction` type stays SQLite-specific here temporarily. Task 8 replaces it with a dialect-agnostic inferred type.

- [ ] **Step 3: Update packages/trpc/models/tags.ts**

Change the import (line 16) from:

```typescript
import { SqliteError } from "@karakeep/db";
```

To:

```typescript
import { isUniqueConstraintError } from "@karakeep/db";
```

Change the first catch block (around line 73) from:

```typescript
      if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
```

To:

```typescript
      if (isUniqueConstraintError(e)) {
```

Change the second catch block (around line 372) from:

```typescript
      if (e instanceof SqliteError) {
        if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
```

To:

```typescript
      if (isUniqueConstraintError(e)) {
        {
```

(Remove the nested `if` since the predicate already checks all unique constraint variants.)

- [ ] **Step 4: Update packages/trpc/models/users.ts**

Change the import (line 6) from:

```typescript
import { SqliteError } from "@karakeep/db";
```

To:

```typescript
import { isUniqueConstraintError } from "@karakeep/db";
```

Change the catch block (around line 129) from:

```typescript
        if (e instanceof SqliteError) {
          if (e.code === "SQLITE_CONSTRAINT_UNIQUE") {
```

To:

```typescript
        if (isUniqueConstraintError(e)) {
          {
```

- [ ] **Step 5: Update packages/trpc/models/lists.ts**

Change the import (line 6) from:

```typescript
import { SqliteError } from "@karakeep/db";
```

To:

```typescript
import { isUniqueConstraintError } from "@karakeep/db";
```

Change the catch block (around line 962) from:

```typescript
      if (e instanceof SqliteError) {
        if (e.code == "SQLITE_CONSTRAINT_PRIMARYKEY") {
```

To:

```typescript
      if (isUniqueConstraintError(e)) {
        {
```

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db/errors.ts packages/db/index.ts packages/trpc/models/tags.ts packages/trpc/models/users.ts packages/trpc/models/lists.ts
git commit -m "refactor(db): abstract error handling with isUniqueConstraintError"
```

---

## Task 7: Wire Up Conditional Schema Entry Point

**Files:**
- Modify: `packages/db/schema.ts`
- Modify: `packages/db/schema.relations.ts`

- [ ] **Step 1: Update schema.ts to conditionally export**

Replace `packages/db/schema.ts` with:

```typescript
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
```

Design note: ESM does not support conditional `export *`. Since both schema files export identical names and the Drizzle query builder uses column descriptors by name at runtime, always exporting the SQLite types is safe. The `db` instance (from `drizzle.ts`) is initialized with the correct dialect's schema internally.

- [ ] **Step 2: Verify the import chain works**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/db/schema.ts packages/db/schema.relations.ts
git commit -m "refactor(db): wire up conditional schema entry point"
```

---

## Task 8: Rewrite drizzle.ts as Dialect Factory

**Files:**
- Modify: `packages/db/drizzle.ts`
- Modify: `packages/db/index.ts`
- Modify: `packages/db/package.json` (add `postgres` dependency)

- [ ] **Step 1: Install postgres.js**

```bash
cd /Users/jford/dev/amplio/karakeep
pnpm add --filter @karakeep/db postgres
```

- [ ] **Step 2: Rewrite drizzle.ts**

Replace `packages/db/drizzle.ts` with:

```typescript
import "dotenv/config";

import path from "path";

import serverConfig from "@karakeep/shared/config";

const dialect = serverConfig.database.dialect;

function createSqliteDB() {
  // Dynamic requires to avoid loading both drivers
  const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;
  const { drizzle } = require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  const { instrumentSqliteDatabase } = require("./instrumentation") as typeof import("./instrumentation");
  const sqliteSchema = require("./schema.sqlite");

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

  return drizzle(sqlite, { schema: sqliteSchema });
}

function createPostgresDB() {
  const postgres = require("postgres") as typeof import("postgres").default;
  const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  const pgSchema = require("./schema.pg");

  const dbConfig = serverConfig.database;
  const connectionString =
    dbConfig.url ??
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;

  const client = postgres(connectionString);
  return drizzle(client, { schema: pgSchema });
}

export const db = dialect === "postgresql" ? createPostgresDB() : createSqliteDB();
export type DB = typeof db;

// Dialect-agnostic transaction type inferred from the db instance
export type KarakeepDBTransaction = Parameters<
  Parameters<DB["transaction"]>[0]
>[0];

export function getInMemoryDB(runMigrations: boolean) {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3").default;
  const { drizzle } = require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  const { migrate } = require("drizzle-orm/better-sqlite3/migrator") as typeof import("drizzle-orm/better-sqlite3/migrator");
  const sqliteSchema = require("./schema.sqlite");

  const mem = new Database(":memory:");
  const db = drizzle(mem, { schema: sqliteSchema, logger: false });
  if (runMigrations) {
    migrate(db, {
      migrationsFolder: path.resolve(__dirname, "./migrations/sqlite"),
    });
  }
  return db;
}

export { dialect };
```

- [ ] **Step 3: Update packages/db/index.ts**

Ensure `packages/db/index.ts` exports the new types:

```typescript
export { db, dialect } from "./drizzle";
export type { DB, KarakeepDBTransaction } from "./drizzle";
export * as schema from "./schema";
export { isUniqueConstraintError } from "./errors";
```

- [ ] **Step 4: Run tests (SQLite mode — the default)**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle.ts packages/db/index.ts packages/db/package.json pnpm-lock.yaml
git commit -m "feat(db): rewrite drizzle.ts as dialect factory with PostgreSQL support"
```

---

## Task 9: Update Instrumentation

**Files:**
- Modify: `packages/db/instrumentation.ts`

- [ ] **Step 1: Rename and keep SQLite instrumentation, add PostgreSQL stub**

Replace `packages/db/instrumentation.ts` with:

```typescript
import type Database from "better-sqlite3";
import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

const TRACER_NAME = "@karakeep/db";

function getOperationType(sql: string): string {
  return sql.trimStart().split(/\s/, 1)[0]?.toUpperCase() ?? "UNKNOWN";
}

/**
 * Instruments a better-sqlite3 Database instance with OpenTelemetry tracing.
 */
export function instrumentSqliteDatabase(
  sqlite: Database.Database,
): Database.Database {
  const tracer = trace.getTracer(TRACER_NAME);
  const origPrepare = sqlite.prepare.bind(sqlite);

  sqlite.prepare = function (sql: string) {
    const stmt = origPrepare(sql);
    const operation = getOperationType(sql);
    const spanName = `db.${operation.toLowerCase()}`;

    for (const method of ["run", "get", "all"] as const) {
      type QueryFn = (...args: unknown[]) => unknown;
      const original = (stmt[method] as QueryFn).bind(stmt);
      (stmt[method] as QueryFn) = function (...args: unknown[]) {
        const span = tracer.startSpan(spanName, {
          kind: SpanKind.CLIENT,
          attributes: {
            "db.system": "sqlite",
            "db.statement": sql,
            "db.operation": operation,
          },
        });

        try {
          const result = original(...args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          span.recordException(
            error instanceof Error ? error : new Error(String(error)),
          );
          throw error;
        } finally {
          span.end();
        }
      };
    }

    return stmt;
  } as typeof sqlite.prepare;

  return sqlite;
}
```

Note: The function is renamed from `instrumentDatabase` to `instrumentSqliteDatabase`. The reference in `drizzle.ts` (Task 8) already uses the new name. PostgreSQL instrumentation via postgres.js `debug` callback or Drizzle logger can be added as a follow-up — postgres.js already emits query timing info internally.

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/db/instrumentation.ts
git commit -m "refactor(db): rename instrumentDatabase to instrumentSqliteDatabase"
```

---

## Task 10: Update Drizzle Kit Configs and migrate.ts

**Files:**
- Create: `packages/db/drizzle.config.sqlite.ts`
- Create: `packages/db/drizzle.config.pg.ts`
- Modify: `packages/db/drizzle.config.ts` (remove or repurpose)
- Modify: `packages/db/migrate.ts`
- Modify: `packages/db/package.json` (update scripts)

- [ ] **Step 1: Create drizzle.config.sqlite.ts**

Create `packages/db/drizzle.config.sqlite.ts`:

```typescript
import "dotenv/config";

import type { Config } from "drizzle-kit";

import serverConfig from "@karakeep/shared/config";

const databaseURL = serverConfig.dataDir
  ? `${serverConfig.dataDir}/db.db`
  : "./db.db";

export default {
  dialect: "sqlite",
  schema: "./schema.sqlite.ts",
  out: "./migrations/sqlite",
  dbCredentials: {
    url: databaseURL,
  },
} satisfies Config;
```

- [ ] **Step 2: Create drizzle.config.pg.ts**

Create `packages/db/drizzle.config.pg.ts`:

```typescript
import "dotenv/config";

import type { Config } from "drizzle-kit";

import serverConfig from "@karakeep/shared/config";

const dbConfig = serverConfig.database;
const connectionString =
  dbConfig.url ??
  `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;

export default {
  dialect: "postgresql",
  schema: "./schema.pg.ts",
  out: "./migrations/pg",
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config;
```

- [ ] **Step 3: Remove old drizzle.config.ts**

```bash
rm packages/db/drizzle.config.ts
```

- [ ] **Step 4: Update migrate.ts for dialect-aware migration**

Replace `packages/db/migrate.ts` with:

```typescript
import "dotenv/config";

import path from "path";

import serverConfig from "@karakeep/shared/config";

const dialect = serverConfig.database.dialect;

if (dialect === "postgresql") {
  const { db } = await import("./drizzle");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  await migrate(db as Parameters<typeof migrate>[0], {
    migrationsFolder: path.resolve(__dirname, "./migrations/pg"),
  });
} else {
  const { db } = await import("./drizzle");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  migrate(db as Parameters<typeof migrate>[0], {
    migrationsFolder: path.resolve(__dirname, "./migrations/sqlite"),
  });
}
```

- [ ] **Step 5: Update package.json scripts**

In `packages/db/package.json`, update the scripts:

```json
"scripts": {
  "typecheck": "tsc --noEmit",
  "migrate": "tsx migrate.ts",
  "generate:sqlite": "drizzle-kit generate --config=drizzle.config.sqlite.ts",
  "generate:pg": "drizzle-kit generate --config=drizzle.config.pg.ts",
  "generate": "pnpm generate:sqlite && pnpm generate:pg",
  "studio": "drizzle-kit studio",
  "format": "oxfmt --check .",
  "format:fix": "oxfmt .",
  "lint": "oxlint .",
  "lint:fix": "oxlint . --fix"
}
```

- [ ] **Step 6: Run tests (SQLite mode)**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/db/drizzle.config.sqlite.ts packages/db/drizzle.config.pg.ts packages/db/migrate.ts packages/db/package.json
git rm packages/db/drizzle.config.ts
git commit -m "feat(db): add per-dialect Drizzle Kit configs and dialect-aware migration runner"
```

---

## Task 11: Generate PostgreSQL Baseline Migration

**Files:**
- Create: `packages/db/migrations/pg/0000_*.sql` (generated by Drizzle Kit)
- Create: `packages/db/migrations/pg/meta/` (generated by Drizzle Kit)

- [ ] **Step 1: Generate the baseline PostgreSQL migration**

This requires `DATABASE_DIALECT=postgresql` in the environment for the config to parse, but does not require an actual PostgreSQL connection for generation:

```bash
cd packages/db
DATABASE_DIALECT=postgresql DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder pnpm generate:pg
```

Expected: Drizzle Kit generates a `0000_*.sql` file in `packages/db/migrations/pg/` that creates all 32 tables with PostgreSQL syntax, plus a `meta/` directory with `_journal.json` and `0000_snapshot.json`.

- [ ] **Step 2: Verify the generated migration looks correct**

Review the generated SQL file. It should contain `CREATE TABLE` statements for all 32 tables using PostgreSQL types (`timestamp with time zone`, `boolean`, `double precision`, `jsonb`, etc.).

- [ ] **Step 3: Commit**

```bash
git add packages/db/migrations/pg
git commit -m "feat(db): add PostgreSQL baseline migration"
```

---

## Task 12: Create SQL Helpers for Dialect-Specific Queries

**Files:**
- Create: `packages/db/sql-helpers.ts`
- Modify: `packages/trpc/models/users.ts:715-730` and `:1048-1063`

- [ ] **Step 1: Create sql-helpers.ts**

Create `packages/db/sql-helpers.ts`:

```typescript
import type { AnyColumn } from "drizzle-orm";
import { sql, SQL } from "drizzle-orm";

import { dialect } from "./drizzle";

/**
 * Extracts the domain (hostname) from a URL column, stripping the protocol
 * and path. Works across both SQLite and PostgreSQL.
 */
export function domainFromUrl(urlColumn: AnyColumn): SQL {
  if (dialect === "postgresql") {
    // PostgreSQL: use substring with regex to extract host
    // Matches everything after :// up to the next /
    return sql`substring(${urlColumn} from '://([^/]+)')`;
  }
  // SQLite: use INSTR/SUBSTR to extract host
  return sql`CASE
    WHEN ${urlColumn} LIKE 'https://%' THEN
      CASE
        WHEN INSTR(SUBSTR(${urlColumn}, 9), '/') > 0 THEN
          SUBSTR(${urlColumn}, 9, INSTR(SUBSTR(${urlColumn}, 9), '/') - 1)
        ELSE
          SUBSTR(${urlColumn}, 9)
      END
    WHEN ${urlColumn} LIKE 'http://%' THEN
      CASE
        WHEN INSTR(SUBSTR(${urlColumn}, 8), '/') > 0 THEN
          SUBSTR(${urlColumn}, 8, INSTR(SUBSTR(${urlColumn}, 8), '/') - 1)
        ELSE
          SUBSTR(${urlColumn}, 8)
      END
    ELSE
      ${urlColumn}
    END`;
}
```

- [ ] **Step 2: Add export to packages/db/index.ts**

Add to `packages/db/index.ts`:

```typescript
export { domainFromUrl } from "./sql-helpers";
```

- [ ] **Step 3: Update packages/trpc/models/users.ts — first occurrence**

In `packages/trpc/models/users.ts`, add the import:

```typescript
import { domainFromUrl } from "@karakeep/db";
```

Replace the inline SQL at line 715 (the `.groupBy(sql`CASE...` block) with:

```typescript
        .groupBy(domainFromUrl(bookmarkLinks.url))
```

Also update the corresponding `.as("domain")` select alias to use `domainFromUrl`:

Find the `sql`CASE...`.as("domain")` in the select and replace with:

```typescript
          domain: domainFromUrl(bookmarkLinks.url).as("domain"),
```

- [ ] **Step 4: Update packages/trpc/models/users.ts — second occurrence**

Do the same replacement for the second occurrence around line 1048 — same pattern, same replacement with `domainFromUrl(bookmarkLinks.url)`.

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/db/sql-helpers.ts packages/db/index.ts packages/trpc/models/users.ts
git commit -m "feat(db): add domainFromUrl SQL helper for cross-dialect URL parsing"
```

---

## Task 13: Update Environment Variable Documentation

**Files:**
- Modify: `docs/docs/03-configuration/01-environment-variables.md`

- [ ] **Step 1: Add database section to env vars docs**

In `docs/docs/03-configuration/01-environment-variables.md`, add new rows to the table after the `DB_WAL_MODE` row (line 24):

```markdown
| DATABASE_DIALECT                       | No                                    | sqlite          | Database engine to use. Set to `postgresql` to use PostgreSQL instead of SQLite.                                                                                                                                                                                        |
| DATABASE_URL                           | When dialect is postgresql            | Not set         | PostgreSQL connection string (e.g. `postgresql://user:password@host:5432/dbname`). Alternative to individual connection fields.                                                                                                                                         |
| DATABASE_HOST                          | When dialect is postgresql (no URL)   | Not set         | PostgreSQL server hostname.                                                                                                                                                                                                                                             |
| DATABASE_PORT                          | No                                    | 5432            | PostgreSQL server port.                                                                                                                                                                                                                                                 |
| DATABASE_USER                          | When dialect is postgresql (no URL)   | Not set         | PostgreSQL username.                                                                                                                                                                                                                                                    |
| DATABASE_PASSWORD                      | When dialect is postgresql (no URL)   | Not set         | PostgreSQL password.                                                                                                                                                                                                                                                    |
| DATABASE_NAME                          | When dialect is postgresql (no URL)   | Not set         | PostgreSQL database name.                                                                                                                                                                                                                                               |
```

- [ ] **Step 2: Update the DB_WAL_MODE description**

Update the `DB_WAL_MODE` row to note it's SQLite-only:

```markdown
| DB_WAL_MODE                            | No                                    | false           | SQLite only. Enables WAL mode for better performance. There's no reason not to set this to true unless you're running the db on a network attached drive.                                                                                                               |
```

- [ ] **Step 3: Commit**

```bash
git add docs/docs/03-configuration/01-environment-variables.md
git commit -m "docs: add PostgreSQL configuration environment variables"
```

---

## Task 14: Create SQLite-to-PostgreSQL Migration Script

**Files:**
- Create: `packages/db/scripts/migrate-to-pg.ts`
- Modify: `packages/db/package.json` (add script)

- [ ] **Step 1: Create the migration script**

Create `packages/db/scripts/migrate-to-pg.ts`:

```typescript
import "dotenv/config";

import path from "path";
import Database from "better-sqlite3";
import postgres from "postgres";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import serverConfig from "@karakeep/shared/config";

// Table names in dependency order (parents before children)
const TABLE_ORDER = [
  "user",
  "config",
  "account",
  "session",
  "verificationToken",
  "passwordResetToken",
  "apiKey",
  "bookmarks",
  "bookmarkLinks",
  "bookmarkTexts",
  "bookmarkAssets",
  "assets",
  "bookmarkTags",
  "tagsOnBookmarks",
  "highlights",
  "userReadingProgress",
  "bookmarkLists",
  "bookmarksInLists",
  "listCollaborators",
  "listInvitations",
  "customPrompts",
  "rssFeeds",
  "rssFeedImports",
  "webhooks",
  "backups",
  "ruleEngineRules",
  "ruleEngineActions",
  "invites",
  "subscriptions",
  "importSessions",
  "importSessionBookmarks",
  "importStagingBookmarks",
];

// Columns that are integer timestamps in SQLite → timestamp in PostgreSQL
// Map of tableName -> Set of column names
const TIMESTAMP_COLUMNS: Record<string, Set<string>> = {
  user: new Set(["emailVerified"]),
  session: new Set(["expires"]),
  verificationToken: new Set(["expires"]),
  passwordResetToken: new Set(["expires", "createdAt"]),
  apiKey: new Set(["createdAt", "lastUsedAt"]),
  bookmarks: new Set(["createdAt", "modifiedAt"]),
  bookmarkLinks: new Set(["datePublished", "dateModified", "crawledAt"]),
  bookmarkTags: new Set(["createdAt"]),
  tagsOnBookmarks: new Set(["attachedAt"]),
  highlights: new Set(["createdAt"]),
  userReadingProgress: new Set(["modifiedAt"]),
  bookmarkLists: new Set(["createdAt"]),
  bookmarksInLists: new Set(["addedAt"]),
  listCollaborators: new Set(["addedAt"]),
  listInvitations: new Set(["invitedAt"]),
  customPrompts: new Set(["createdAt"]),
  rssFeeds: new Set(["createdAt", "lastFetchedAt", "lastSuccessfulFetchAt"]),
  rssFeedImports: new Set(["createdAt"]),
  webhooks: new Set(["createdAt"]),
  backups: new Set(["createdAt"]),
  ruleEngineRules: new Set([]),
  ruleEngineActions: new Set([]),
  invites: new Set(["createdAt", "usedAt"]),
  subscriptions: new Set(["startDate", "endDate", "createdAt", "modifiedAt"]),
  importSessions: new Set(["lastProcessedAt", "createdAt", "modifiedAt"]),
  importSessionBookmarks: new Set(["createdAt"]),
  importStagingBookmarks: new Set([
    "sourceAddedAt",
    "processingStartedAt",
    "createdAt",
    "completedAt",
  ]),
};

// Columns that are integer booleans (0/1) in SQLite → boolean in PostgreSQL
const BOOLEAN_COLUMNS: Record<string, Set<string>> = {
  user: new Set([
    "browserCrawlingEnabled",
    "backupsEnabled",
    "autoTaggingEnabled",
    "autoSummarizationEnabled",
  ]),
  bookmarks: new Set(["archived", "favourited"]),
  bookmarkLists: new Set(["public"]),
  customPrompts: new Set(["enabled"]),
  rssFeeds: new Set(["enabled", "importTags"]),
  ruleEngineRules: new Set(["enabled"]),
  subscriptions: new Set(["cancelAtPeriodEnd"]),
  importStagingBookmarks: new Set(["archived"]),
};

// Columns that are text JSON in SQLite → jsonb in PostgreSQL
const JSON_COLUMNS: Record<string, Set<string>> = {
  user: new Set(["curatedTagIds"]),
  webhooks: new Set(["events"]),
  importStagingBookmarks: new Set(["tags", "listIds"]),
};

// Columns that are generated (skip during insert)
const GENERATED_COLUMNS: Record<string, Set<string>> = {
  bookmarkTags: new Set(["normalizedName"]),
};

function transformRow(
  tableName: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const timestamps = TIMESTAMP_COLUMNS[tableName] ?? new Set();
  const booleans = BOOLEAN_COLUMNS[tableName] ?? new Set();
  const jsonCols = JSON_COLUMNS[tableName] ?? new Set();
  const generated = GENERATED_COLUMNS[tableName] ?? new Set();

  for (const [key, value] of Object.entries(row)) {
    if (generated.has(key)) {
      continue; // Skip generated columns
    }
    if (value === null || value === undefined) {
      result[key] = null;
      continue;
    }
    if (timestamps.has(key)) {
      // SQLite stores timestamps as epoch seconds (or ms for timestamp_ms)
      const num = value as number;
      // Heuristic: if > 1e12, it's milliseconds; otherwise seconds
      const ms = num > 1e12 ? num : num * 1000;
      result[key] = new Date(ms);
    } else if (booleans.has(key)) {
      result[key] = value === 1 || value === true;
    } else if (jsonCols.has(key)) {
      // SQLite stores as text, PG expects object for jsonb
      result[key] =
        typeof value === "string" ? JSON.parse(value) : value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function main() {
  console.log("=== Karakeep SQLite → PostgreSQL Migration ===\n");
  console.log(
    "WARNING: Back up your SQLite database before proceeding.\n" +
      "This is a one-way, one-time migration. There is no rollback.\n",
  );

  // Validate config
  if (serverConfig.database.dialect !== "postgresql") {
    console.error(
      "ERROR: DATABASE_DIALECT must be set to 'postgresql' for the target database.",
    );
    process.exit(1);
  }

  const sqlitePath = serverConfig.dataDir
    ? `${serverConfig.dataDir}/db.db`
    : "./db.db";

  console.log(`Source SQLite: ${sqlitePath}`);

  const dbConfig = serverConfig.database;
  const connectionString =
    dbConfig.url ??
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.name}`;

  console.log(`Target PostgreSQL: ${connectionString.replace(/:[^:@]+@/, ':***@')}\n`);

  // Open SQLite
  const sqlite = new Database(sqlitePath, { readonly: true });

  // Connect to PostgreSQL
  const pg = postgres(connectionString);
  const pgDb = drizzlePg(pg);

  // Run PG migrations
  console.log("Running PostgreSQL migrations...");
  await migrate(pgDb, {
    migrationsFolder: path.resolve(__dirname, "../migrations/pg"),
  });
  console.log("Migrations complete.\n");

  // Migrate each table
  let totalRows = 0;
  for (const tableName of TABLE_ORDER) {
    const rows = sqlite
      .prepare(`SELECT * FROM "${tableName}"`)
      .all() as Record<string, unknown>[];

    if (rows.length === 0) {
      console.log(`  ${tableName}: 0 rows (skipped)`);
      continue;
    }

    const transformed = rows.map((row) => transformRow(tableName, row));
    const columns = Object.keys(transformed[0]!);
    const quotedColumns = columns.map((c) => `"${c}"`).join(", ");

    // Batch insert in chunks of 500
    const BATCH_SIZE = 500;
    for (let i = 0; i < transformed.length; i += BATCH_SIZE) {
      const batch = transformed.slice(i, i + BATCH_SIZE);
      const valuePlaceholders = batch
        .map(
          (_, rowIdx) =>
            `(${columns.map((_, colIdx) => `$${rowIdx * columns.length + colIdx + 1}`).join(", ")})`,
        )
        .join(", ");

      const flatValues = batch.flatMap((row) =>
        columns.map((col) => row[col]),
      );

      await pg.unsafe(
        `INSERT INTO "${tableName}" (${quotedColumns}) VALUES ${valuePlaceholders}`,
        flatValues as postgres.SerializableParameter[],
      );
    }

    console.log(`  ${tableName}: ${rows.length} rows`);
    totalRows += rows.length;
  }

  console.log(`\nMigration complete. ${totalRows} total rows migrated.`);

  sqlite.close();
  await pg.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Add script to package.json**

In `packages/db/package.json`, add to scripts:

```json
"migrate-to-pg": "tsx scripts/migrate-to-pg.ts"
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/migrate-to-pg.ts packages/db/package.json
git commit -m "feat(db): add SQLite-to-PostgreSQL data migration script"
```

---

## Task 15: Add PostgreSQL Setup Guide

**Files:**
- Create: `docs/docs/03-configuration/02-postgresql.md`

- [ ] **Step 1: Create the PostgreSQL guide**

Create `docs/docs/03-configuration/02-postgresql.md`:

```markdown
# Using PostgreSQL

By default, Karakeep uses SQLite as its database — no additional setup required. However, if you need to host your database on a remote server, NAS, or cloud provider, you can use PostgreSQL instead. SQLite performs poorly over network-attached storage, and PostgreSQL's client-server architecture handles remote connections natively.

## When to Use PostgreSQL

Use PostgreSQL if:

- Your database will be on a **network-attached drive** (NAS, NFS, SMB)
- You want to use a **managed database service** (AWS RDS, Supabase, Neon, etc.)
- You need the database on a **separate server** from the application

Stick with SQLite if:

- You're running everything on a single machine
- You want the simplest possible setup
- You're just trying Karakeep out

## Configuration

Set these environment variables to enable PostgreSQL:

### Option A: Connection String

``​`
DATABASE_DIALECT=postgresql
DATABASE_URL=postgresql://karakeep:yourpassword@db.example.com:5432/karakeep
``​`

### Option B: Individual Fields

``​`
DATABASE_DIALECT=postgresql
DATABASE_HOST=db.example.com
DATABASE_PORT=5432
DATABASE_USER=karakeep
DATABASE_PASSWORD=yourpassword
DATABASE_NAME=karakeep
``​`

If both `DATABASE_URL` and individual fields are set, `DATABASE_URL` takes precedence.

## Docker

Pass the environment variables to your container. No changes to `docker-compose.yml` are needed — Karakeep connects to your existing PostgreSQL instance:

``​`yaml
services:
  web:
    environment:
      - DATABASE_DIALECT=postgresql
      - DATABASE_URL=postgresql://karakeep:yourpassword@db.example.com:5432/karakeep
``​`

## Migrating from SQLite

If you have an existing Karakeep installation using SQLite and want to switch to PostgreSQL:

1. **Back up your SQLite database** (copy `db.db` from your data directory)
2. Set up your PostgreSQL database and configure the `DATABASE_*` environment variables
3. Run the migration script:

``​`bash
pnpm db:migrate-to-pg
``​`

The script copies all data from SQLite to PostgreSQL, transforming data types automatically. Generated columns (like tag normalized names) are regenerated by PostgreSQL.

This is a one-way, one-time migration. There is no automatic rollback — keep your SQLite backup until you've verified everything works.

## Notes

- `DATA_DIR` and `DB_WAL_MODE` are ignored when using PostgreSQL
- Connection pooling is handled by the postgres.js driver internally; for advanced pooling, use an external pooler like PgBouncer
- Karakeep requires PostgreSQL 14 or later
```

- [ ] **Step 2: Commit**

```bash
git add docs/docs/03-configuration/02-postgresql.md
git commit -m "docs: add PostgreSQL setup guide"
```

---

## Task 16: Run Full Verification in SQLite Mode

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: PASS (or pre-existing warnings only)

- [ ] **Step 3: Run formatter**

Run: `pnpm format`
Expected: PASS

- [ ] **Step 4: Run tests**

Run: `pnpm test`
Expected: PASS — all existing tests pass in SQLite mode (the default)

- [ ] **Step 5: Fix any issues found and commit**

If any checks fail, fix the issues and commit:

```bash
git add -A
git commit -m "fix(db): address typecheck/lint/test issues from PostgreSQL support"
```
