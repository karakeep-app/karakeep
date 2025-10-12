import type { AdapterAccount } from "@auth/core/adapters";
import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import {
  AnySQLiteColumn,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

function createdAtField() {
  return integer("createdAt", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date());
}

function modifiedAtField() {
  return integer("modifiedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date());
}

export const users = sqliteTable("user", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  password: text("password"),
  salt: text("salt").notNull().default(""),
  role: text("role", { enum: ["admin", "user"] }).default("user"),

  // Admin Only Settings
  bookmarkQuota: integer("bookmarkQuota"),
  storageQuota: integer("storageQuota"),
  browserCrawlingEnabled: integer("browserCrawlingEnabled", {
    mode: "boolean",
  }),

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
});

export const accounts = sqliteTable(
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

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const passwordResetTokens = sqliteTable(
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
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAtField(),
  },
  (prt) => [index("passwordResetTokens_userId_idx").on(prt.userId)],
);

export const apiKeys = sqliteTable(
  "apiKey",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    createdAt: createdAtField(),
    keyId: text("keyId").notNull().unique(),
    keyHash: text("keyHash").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (ak) => [unique().on(ak.name, ak.userId)],
);

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
    title: text("title"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    favourited: integer("favourited", { mode: "boolean" })
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
    index("bookmarks_archived_idx").on(b.archived),
    index("bookmarks_favourited_idx").on(b.favourited),
    index("bookmarks_createdAt_idx").on(b.createdAt),
  ],
);

export const bookmarkLinks = sqliteTable(
  "bookmarkLinks",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId())
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),

    // Crawled info
    title: text("title"),
    description: text("description"),
    author: text("author"),
    publisher: text("publisher"),
    datePublished: integer("datePublished", { mode: "timestamp" }),
    dateModified: integer("dateModified", { mode: "timestamp" }),
    imageUrl: text("imageUrl"),
    favicon: text("favicon"),
    htmlContent: text("htmlContent"),
    contentAssetId: text("contentAssetId"),
    crawledAt: integer("crawledAt", { mode: "timestamp" }),
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
  ASSET_SCREENSHOT = "assetScreenshot",
  LINK_FULL_PAGE_ARCHIVE = "linkFullPageArchive",
  LINK_PRECRAWLED_ARCHIVE = "linkPrecrawledArchive",
  LINK_VIDEO = "linkVideo",
  LINK_HTML_CONTENT = "linkHtmlContent",
  BOOKMARK_ASSET = "bookmarkAsset",
  UNKNOWN = "unknown",
}

export const assets = sqliteTable(
  "assets",
  {
    // Asset ids don't have a default function as they are generated by the caller
    id: text("id").notNull().primaryKey(),
    assetType: text("assetType", {
      enum: [
        AssetTypes.LINK_BANNER_IMAGE,
        AssetTypes.LINK_SCREENSHOT,
        AssetTypes.ASSET_SCREENSHOT,
        AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        AssetTypes.LINK_PRECRAWLED_ARCHIVE,
        AssetTypes.LINK_VIDEO,
        AssetTypes.LINK_HTML_CONTENT,
        AssetTypes.BOOKMARK_ASSET,
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

export const highlights = sqliteTable(
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

export const bookmarkTexts = sqliteTable("bookmarkTexts", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId())
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  text: text("text"),
  sourceUrl: text("sourceUrl"),
});

export const bookmarkAssets = sqliteTable("bookmarkAssets", {
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

export const bookmarkTags = sqliteTable(
  "bookmarkTags",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
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
  ],
);

export const tagsOnBookmarks = sqliteTable(
  "tagsOnBookmarks",
  {
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: text("tagId")
      .notNull()
      .references(() => bookmarkTags.id, { onDelete: "cascade" }),

    attachedAt: integer("attachedAt", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
    attachedBy: text("attachedBy", { enum: ["ai", "human"] }).notNull(),
  },
  (tb) => [
    primaryKey({ columns: [tb.bookmarkId, tb.tagId] }),
    index("tagsOnBookmarks_tagId_idx").on(tb.tagId),
    index("tagsOnBookmarks_bookmarkId_idx").on(tb.bookmarkId),
  ],
);

export const bookmarkLists = sqliteTable(
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
    // Only applicable for smart lists
    query: text("query"),
    parentId: text("parentId").references(
      (): AnySQLiteColumn => bookmarkLists.id,
      { onDelete: "set null" },
    ),
    // Whoever have access to this token can read the content of this list
    rssToken: text("rssToken"),
    public: integer("public", { mode: "boolean" }).notNull().default(false),
  },
  (bl) => [
    index("bookmarkLists_userId_idx").on(bl.userId),
    unique("bookmarkLists_userId_id_idx").on(bl.userId, bl.id),
  ],
);

export const bookmarksInLists = sqliteTable(
  "bookmarksInLists",
  {
    bookmarkId: text("bookmarkId")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    listId: text("listId")
      .notNull()
      .references(() => bookmarkLists.id, { onDelete: "cascade" }),
    addedAt: integer("addedAt", { mode: "timestamp" }).$defaultFn(
      () => new Date(),
    ),
  },
  (tb) => [
    primaryKey({ columns: [tb.bookmarkId, tb.listId] }),
    index("bookmarksInLists_bookmarkId_idx").on(tb.bookmarkId),
    index("bookmarksInLists_listId_idx").on(tb.listId),
  ],
);

export const customPrompts = sqliteTable(
  "customPrompts",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    text: text("text").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
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

export const rssFeedsTable = sqliteTable(
  "rssFeeds",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text("name").notNull(),
    url: text("url").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAtField(),
    lastFetchedAt: integer("lastFetchedAt", { mode: "timestamp" }),
    lastFetchedStatus: text("lastFetchedStatus", {
      enum: ["pending", "failure", "success"],
    }).default("pending"),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (bl) => [index("rssFeeds_userId_idx").on(bl.userId)],
);

export const webhooksTable = sqliteTable(
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
    events: text("events", { mode: "json" })
      .notNull()
      .$type<("created" | "edited" | "crawled" | "ai tagged" | "deleted")[]>(),
    token: text("token"),
  },
  (bl) => [index("webhooks_userId_idx").on(bl.userId)],
);

export const rssFeedImportsTable = sqliteTable(
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
  ],
);

export const config = sqliteTable("config", {
  key: text("key").notNull().primaryKey(),
  value: text("value").notNull(),
});

export const ruleEngineRulesTable = sqliteTable(
  "ruleEngineRules",
  {
    id: text("id")
      .notNull()
      .primaryKey()
      .$defaultFn(() => createId()),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    name: text("name").notNull(),
    description: text("description"),
    event: text("event").notNull(),
    condition: text("condition").notNull(),

    // References
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    listId: text("listId"),
    tagId: text("tagId"),
  },
  (rl) => [
    index("ruleEngine_userId_idx").on(rl.userId),

    // Ensures correct ownership
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

export const ruleEngineActionsTable = sqliteTable(
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

    // References
    listId: text("listId"),
    tagId: text("tagId"),
  },
  (rl) => [
    index("ruleEngineActions_userId_idx").on(rl.userId),
    index("ruleEngineActions_ruleId_idx").on(rl.ruleId),
    // Ensures correct ownership
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

export const invites = sqliteTable("invites", {
  id: text("id")
    .notNull()
    .primaryKey()
    .$defaultFn(() => createId()),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAtField(),
  usedAt: integer("usedAt", { mode: "timestamp" }),
  invitedBy: text("invitedBy")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const subscriptions = sqliteTable(
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
    cancelAtPeriodEnd: integer("cancelAtPeriodEnd", {
      mode: "boolean",
    }).default(false),
    startDate: integer("startDate", { mode: "timestamp" }),
    endDate: integer("endDate", { mode: "timestamp" }),
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
  },
  (s) => [
    index("subscriptions_userId_idx").on(s.userId),
    index("subscriptions_stripeCustomerId_idx").on(s.stripeCustomerId),
  ],
);

export const importSessions = sqliteTable(
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
    createdAt: createdAtField(),
    modifiedAt: modifiedAtField(),
  },
  (is) => [index("importSessions_userId_idx").on(is.userId)],
);

export const importSessionBookmarks = sqliteTable(
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

// Relations

export const userRelations = relations(users, ({ many, one }) => ({
  tags: many(bookmarkTags),
  bookmarks: many(bookmarks),
  webhooks: many(webhooksTable),
  rules: many(ruleEngineRulesTable),
  invites: many(invites),
  subscription: one(subscriptions),
  importSessions: many(importSessions),
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
