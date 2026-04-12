import { relations } from "drizzle-orm";

import {
  apiKeys,
  assets,
  backupsTable,
  bookmarkAssets,
  bookmarkLinks,
  bookmarkLists,
  bookmarkTags,
  bookmarkTexts,
  bookmarks,
  bookmarksInLists,
  importSessionBookmarks,
  importSessions,
  invites,
  listCollaborators,
  listInvitations,
  passwordResetTokens,
  ruleEngineActionsTable,
  ruleEngineRulesTable,
  rssFeedImportsTable,
  rssFeedsTable,
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
