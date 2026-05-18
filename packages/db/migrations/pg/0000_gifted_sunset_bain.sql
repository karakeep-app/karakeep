CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "apiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"keyId" text NOT NULL,
	"keyHash" text NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "apiKey_keyId_unique" UNIQUE("keyId"),
	CONSTRAINT "apiKey_name_userId_unique" UNIQUE("name","userId")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"assetType" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"contentType" text,
	"fileName" text,
	"bookmarkId" text,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"assetId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"size" integer NOT NULL,
	"bookmarkCount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "bookmarkAssets" (
	"id" text PRIMARY KEY NOT NULL,
	"assetType" text NOT NULL,
	"assetId" text NOT NULL,
	"content" text,
	"metadata" text,
	"fileName" text,
	"sourceUrl" text
);
--> statement-breakpoint
CREATE TABLE "bookmarkLinks" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"author" text,
	"publisher" text,
	"datePublished" timestamp with time zone,
	"dateModified" timestamp with time zone,
	"imageUrl" text,
	"favicon" text,
	"htmlContent" text,
	"contentAssetId" text,
	"crawledAt" timestamp with time zone,
	"crawlStatus" text DEFAULT 'pending',
	"crawlStatusCode" integer DEFAULT 200
);
--> statement-breakpoint
CREATE TABLE "bookmarkLists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"query" text,
	"parentId" text,
	"rssToken" text,
	"public" boolean DEFAULT false NOT NULL,
	CONSTRAINT "bookmarkLists_userId_id_idx" UNIQUE("userId","id")
);
--> statement-breakpoint
CREATE TABLE "bookmarkTags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalizedName" text GENERATED ALWAYS AS (lower(replace(replace(replace("bookmarkTags"."name", ' ', ''), '-', ''), '_', ''))) STORED,
	"createdAt" timestamp with time zone NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "bookmarkTags_userId_name_unique" UNIQUE("userId","name"),
	CONSTRAINT "bookmarkTags_userId_id_idx" UNIQUE("userId","id")
);
--> statement-breakpoint
CREATE TABLE "bookmarkTexts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text,
	"sourceUrl" text
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"modifiedAt" timestamp with time zone,
	"title" text,
	"archived" boolean DEFAULT false NOT NULL,
	"favourited" boolean DEFAULT false NOT NULL,
	"userId" text NOT NULL,
	"taggingStatus" text DEFAULT 'pending',
	"summarizationStatus" text DEFAULT 'pending',
	"summary" text,
	"note" text,
	"type" text NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "bookmarksInLists" (
	"bookmarkId" text NOT NULL,
	"listId" text NOT NULL,
	"addedAt" timestamp with time zone,
	"listMembershipId" text,
	CONSTRAINT "bookmarksInLists_bookmarkId_listId_pk" PRIMARY KEY("bookmarkId","listId")
);
--> statement-breakpoint
CREATE TABLE "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customPrompts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"enabled" boolean NOT NULL,
	"appliesTo" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlights" (
	"id" text PRIMARY KEY NOT NULL,
	"bookmarkId" text NOT NULL,
	"userId" text NOT NULL,
	"startOffset" integer NOT NULL,
	"endOffset" integer NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"text" text,
	"note" text,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "importSessionBookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"importSessionId" text NOT NULL,
	"bookmarkId" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "importSessionBookmarks_importSessionId_bookmarkId_unique" UNIQUE("importSessionId","bookmarkId")
);
--> statement-breakpoint
CREATE TABLE "importSessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"userId" text NOT NULL,
	"message" text,
	"rootListId" text,
	"status" text DEFAULT 'staging' NOT NULL,
	"lastProcessedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"modifiedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "importStagingBookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"importSessionId" text NOT NULL,
	"type" text NOT NULL,
	"url" text,
	"title" text,
	"content" text,
	"note" text,
	"tags" jsonb,
	"listIds" jsonb,
	"sourceAddedAt" timestamp with time zone,
	"archived" boolean,
	"status" text DEFAULT 'pending' NOT NULL,
	"processingStartedAt" timestamp with time zone,
	"result" text,
	"resultReason" text,
	"resultBookmarkId" text,
	"createdAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"invitedBy" text NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "listCollaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"listId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"addedBy" text,
	CONSTRAINT "listCollaborators_listId_userId_unique" UNIQUE("listId","userId")
);
--> statement-breakpoint
CREATE TABLE "listInvitations" (
	"id" text PRIMARY KEY NOT NULL,
	"listId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invitedAt" timestamp with time zone NOT NULL,
	"invitedEmail" text,
	"invitedBy" text,
	CONSTRAINT "listInvitations_listId_userId_unique" UNIQUE("listId","userId")
);
--> statement-breakpoint
CREATE TABLE "passwordResetToken" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	CONSTRAINT "passwordResetToken_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "rssFeedImports" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"entryId" text NOT NULL,
	"rssFeedId" text NOT NULL,
	"bookmarkId" text,
	CONSTRAINT "rssFeedImports_rssFeedId_entryId_unique" UNIQUE("rssFeedId","entryId")
);
--> statement-breakpoint
CREATE TABLE "rssFeeds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"importTags" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"lastFetchedAt" timestamp with time zone,
	"lastSuccessfulFetchAt" timestamp with time zone,
	"lastFetchedStatus" text DEFAULT 'pending',
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ruleEngineActions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"ruleId" text NOT NULL,
	"action" text NOT NULL,
	"listId" text,
	"tagId" text
);
--> statement-breakpoint
CREATE TABLE "ruleEngineRules" (
	"id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"event" text NOT NULL,
	"condition" text NOT NULL,
	"userId" text NOT NULL,
	"listId" text,
	"tagId" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"stripeCustomerId" text NOT NULL,
	"stripeSubscriptionId" text,
	"status" text NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"priceId" text,
	"cancelAtPeriodEnd" boolean DEFAULT false,
	"startDate" timestamp with time zone,
	"endDate" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"modifiedAt" timestamp with time zone,
	CONSTRAINT "subscriptions_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "tagsOnBookmarks" (
	"bookmarkId" text NOT NULL,
	"tagId" text NOT NULL,
	"attachedAt" timestamp with time zone,
	"attachedBy" text NOT NULL,
	CONSTRAINT "tagsOnBookmarks_bookmarkId_tagId_pk" PRIMARY KEY("bookmarkId","tagId")
);
--> statement-breakpoint
CREATE TABLE "userReadingProgress" (
	"id" text PRIMARY KEY NOT NULL,
	"bookmarkId" text NOT NULL,
	"userId" text NOT NULL,
	"readingProgressOffset" integer NOT NULL,
	"readingProgressAnchor" text,
	"readingProgressPercent" integer,
	"modifiedAt" timestamp with time zone,
	CONSTRAINT "userReadingProgress_bookmarkId_userId_unique" UNIQUE("bookmarkId","userId")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" timestamp with time zone,
	"image" text,
	"password" text,
	"salt" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'user',
	"bookmarkQuota" integer,
	"storageQuota" integer,
	"browserCrawlingEnabled" boolean,
	"bookmarkClickAction" text DEFAULT 'open_original_link' NOT NULL,
	"archiveDisplayBehaviour" text DEFAULT 'show' NOT NULL,
	"timezone" text DEFAULT 'UTC',
	"backupsEnabled" boolean DEFAULT false NOT NULL,
	"backupsFrequency" text DEFAULT 'weekly' NOT NULL,
	"backupsRetentionDays" integer DEFAULT 30 NOT NULL,
	"readerFontSize" integer,
	"readerLineHeight" double precision,
	"readerFontFamily" text,
	"autoTaggingEnabled" boolean,
	"autoSummarizationEnabled" boolean,
	"tagStyle" text DEFAULT 'titlecase-spaces',
	"curatedTagIds" jsonb,
	"inferredTagLang" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	"userId" text NOT NULL,
	"events" jsonb NOT NULL,
	"token" text
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_assetId_assets_id_fk" FOREIGN KEY ("assetId") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkAssets" ADD CONSTRAINT "bookmarkAssets_id_bookmarks_id_fk" FOREIGN KEY ("id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkLinks" ADD CONSTRAINT "bookmarkLinks_id_bookmarks_id_fk" FOREIGN KEY ("id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkLists" ADD CONSTRAINT "bookmarkLists_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkLists" ADD CONSTRAINT "bookmarkLists_parentId_bookmarkLists_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."bookmarkLists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkTags" ADD CONSTRAINT "bookmarkTags_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarkTexts" ADD CONSTRAINT "bookmarkTexts_id_bookmarks_id_fk" FOREIGN KEY ("id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarksInLists" ADD CONSTRAINT "bookmarksInLists_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarksInLists" ADD CONSTRAINT "bookmarksInLists_listId_bookmarkLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."bookmarkLists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarksInLists" ADD CONSTRAINT "bookmarksInLists_listMembershipId_listCollaborators_id_fk" FOREIGN KEY ("listMembershipId") REFERENCES "public"."listCollaborators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customPrompts" ADD CONSTRAINT "customPrompts_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlights" ADD CONSTRAINT "highlights_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importSessionBookmarks" ADD CONSTRAINT "importSessionBookmarks_importSessionId_importSessions_id_fk" FOREIGN KEY ("importSessionId") REFERENCES "public"."importSessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importSessionBookmarks" ADD CONSTRAINT "importSessionBookmarks_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importSessions" ADD CONSTRAINT "importSessions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importSessions" ADD CONSTRAINT "importSessions_rootListId_bookmarkLists_id_fk" FOREIGN KEY ("rootListId") REFERENCES "public"."bookmarkLists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importStagingBookmarks" ADD CONSTRAINT "importStagingBookmarks_importSessionId_importSessions_id_fk" FOREIGN KEY ("importSessionId") REFERENCES "public"."importSessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "importStagingBookmarks" ADD CONSTRAINT "importStagingBookmarks_resultBookmarkId_bookmarks_id_fk" FOREIGN KEY ("resultBookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invitedBy_user_id_fk" FOREIGN KEY ("invitedBy") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listCollaborators" ADD CONSTRAINT "listCollaborators_listId_bookmarkLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."bookmarkLists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listCollaborators" ADD CONSTRAINT "listCollaborators_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listCollaborators" ADD CONSTRAINT "listCollaborators_addedBy_user_id_fk" FOREIGN KEY ("addedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listInvitations" ADD CONSTRAINT "listInvitations_listId_bookmarkLists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."bookmarkLists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listInvitations" ADD CONSTRAINT "listInvitations_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listInvitations" ADD CONSTRAINT "listInvitations_invitedBy_user_id_fk" FOREIGN KEY ("invitedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passwordResetToken" ADD CONSTRAINT "passwordResetToken_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rssFeedImports" ADD CONSTRAINT "rssFeedImports_rssFeedId_rssFeeds_id_fk" FOREIGN KEY ("rssFeedId") REFERENCES "public"."rssFeeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rssFeedImports" ADD CONSTRAINT "rssFeedImports_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rssFeeds" ADD CONSTRAINT "rssFeeds_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_ruleId_ruleEngineRules_id_fk" FOREIGN KEY ("ruleId") REFERENCES "public"."ruleEngineRules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_userId_tagId_fk" FOREIGN KEY ("userId","tagId") REFERENCES "public"."bookmarkTags"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineActions" ADD CONSTRAINT "ruleEngineActions_userId_listId_fk" FOREIGN KEY ("userId","listId") REFERENCES "public"."bookmarkLists"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineRules" ADD CONSTRAINT "ruleEngineRules_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineRules" ADD CONSTRAINT "ruleEngineRules_userId_tagId_fk" FOREIGN KEY ("userId","tagId") REFERENCES "public"."bookmarkTags"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ruleEngineRules" ADD CONSTRAINT "ruleEngineRules_userId_listId_fk" FOREIGN KEY ("userId","listId") REFERENCES "public"."bookmarkLists"("userId","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagsOnBookmarks" ADD CONSTRAINT "tagsOnBookmarks_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagsOnBookmarks" ADD CONSTRAINT "tagsOnBookmarks_tagId_bookmarkTags_id_fk" FOREIGN KEY ("tagId") REFERENCES "public"."bookmarkTags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userReadingProgress" ADD CONSTRAINT "userReadingProgress_bookmarkId_bookmarks_id_fk" FOREIGN KEY ("bookmarkId") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userReadingProgress" ADD CONSTRAINT "userReadingProgress_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_bookmarkId_idx" ON "assets" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "assets_assetType_idx" ON "assets" USING btree ("assetType");--> statement-breakpoint
CREATE INDEX "assets_userId_idx" ON "assets" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "backups_userId_idx" ON "backups" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "backups_createdAt_idx" ON "backups" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "bookmarkLinks_url_idx" ON "bookmarkLinks" USING btree ("url");--> statement-breakpoint
CREATE INDEX "bookmarkLists_userId_idx" ON "bookmarkLists" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarkTags_name_idx" ON "bookmarkTags" USING btree ("name");--> statement-breakpoint
CREATE INDEX "bookmarkTags_userId_idx" ON "bookmarkTags" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarkTags_normalizedName_idx" ON "bookmarkTags" USING btree ("normalizedName");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_idx" ON "bookmarks" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bookmarks_createdAt_idx" ON "bookmarks" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_createdAt_id_idx" ON "bookmarks" USING btree ("userId","createdAt","id");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_archived_createdAt_id_idx" ON "bookmarks" USING btree ("userId","archived","createdAt","id");--> statement-breakpoint
CREATE INDEX "bookmarks_userId_favourited_createdAt_id_idx" ON "bookmarks" USING btree ("userId","favourited","createdAt","id");--> statement-breakpoint
CREATE INDEX "bookmarksInLists_bookmarkId_idx" ON "bookmarksInLists" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "bookmarksInLists_listId_idx" ON "bookmarksInLists" USING btree ("listId");--> statement-breakpoint
CREATE INDEX "bookmarksInLists_listId_bookmarkId_idx" ON "bookmarksInLists" USING btree ("listId","bookmarkId");--> statement-breakpoint
CREATE INDEX "customPrompts_userId_idx" ON "customPrompts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "highlights_bookmarkId_idx" ON "highlights" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "highlights_userId_idx" ON "highlights" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "importSessionBookmarks_sessionId_idx" ON "importSessionBookmarks" USING btree ("importSessionId");--> statement-breakpoint
CREATE INDEX "importSessionBookmarks_bookmarkId_idx" ON "importSessionBookmarks" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "importSessions_userId_idx" ON "importSessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "importSessions_status_idx" ON "importSessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "importStaging_session_status_idx" ON "importStagingBookmarks" USING btree ("importSessionId","status");--> statement-breakpoint
CREATE INDEX "importStaging_completedAt_idx" ON "importStagingBookmarks" USING btree ("completedAt");--> statement-breakpoint
CREATE INDEX "importStaging_status_idx" ON "importStagingBookmarks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "importStaging_status_processingStartedAt_idx" ON "importStagingBookmarks" USING btree ("status","processingStartedAt");--> statement-breakpoint
CREATE INDEX "listCollaborators_listId_idx" ON "listCollaborators" USING btree ("listId");--> statement-breakpoint
CREATE INDEX "listCollaborators_userId_idx" ON "listCollaborators" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "listInvitations_listId_idx" ON "listInvitations" USING btree ("listId");--> statement-breakpoint
CREATE INDEX "listInvitations_userId_idx" ON "listInvitations" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "listInvitations_status_idx" ON "listInvitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "passwordResetTokens_userId_idx" ON "passwordResetToken" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "rssFeedImports_feedIdIdx_idx" ON "rssFeedImports" USING btree ("rssFeedId");--> statement-breakpoint
CREATE INDEX "rssFeedImports_entryIdIdx_idx" ON "rssFeedImports" USING btree ("entryId");--> statement-breakpoint
CREATE INDEX "rssFeedImports_rssFeedId_bookmarkId_idx" ON "rssFeedImports" USING btree ("rssFeedId","bookmarkId");--> statement-breakpoint
CREATE INDEX "rssFeeds_userId_idx" ON "rssFeeds" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ruleEngineActions_userId_idx" ON "ruleEngineActions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "ruleEngineActions_ruleId_idx" ON "ruleEngineActions" USING btree ("ruleId");--> statement-breakpoint
CREATE INDEX "ruleEngine_userId_idx" ON "ruleEngineRules" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "subscriptions_userId_idx" ON "subscriptions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "subscriptions_stripeCustomerId_idx" ON "subscriptions" USING btree ("stripeCustomerId");--> statement-breakpoint
CREATE INDEX "tagsOnBookmarks_tagId_idx" ON "tagsOnBookmarks" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "tagsOnBookmarks_bookmarkId_idx" ON "tagsOnBookmarks" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "tagsOnBookmarks_tagId_bookmarkId_idx" ON "tagsOnBookmarks" USING btree ("tagId","bookmarkId");--> statement-breakpoint
CREATE INDEX "userReadingProgress_bookmarkId_idx" ON "userReadingProgress" USING btree ("bookmarkId");--> statement-breakpoint
CREATE INDEX "userReadingProgress_userId_idx" ON "userReadingProgress" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "webhooks_userId_idx" ON "webhooks" USING btree ("userId");