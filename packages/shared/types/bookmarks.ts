import { z } from "zod";

import { zCursorV2 } from "./pagination";
import { zAttachedByEnumSchema, zBookmarkTagSchema } from "./tags";

export const MAX_BOOKMARK_TITLE_LENGTH = 1000;

export const enum BookmarkTypes {
  LINK = "link",
  TEXT = "text",
  ASSET = "asset",
  UNKNOWN = "unknown",
}

export const zSortOrder = z.enum(["asc", "desc", "relevance"]);
export type ZSortOrder = z.infer<typeof zSortOrder>;

export const zAssetTypesSchema = z.enum([
  "linkHtmlContent",
  "screenshot",
  "pdf",
  "assetScreenshot",
  "bannerImage",
  "fullPageArchive",
  "video",
  "bookmarkAsset",
  "precrawledArchive",
  "userUploaded",
  "avatar",
  "unknown",
]);
export type ZAssetType = z.infer<typeof zAssetTypesSchema>;

export const zAssetSchema = z.object({
  id: z.string(),
  assetType: zAssetTypesSchema,
  fileName: z.string().nullish(),
});

export const zBookmarkedLinkSchema = z.object({
  type: z.literal(BookmarkTypes.LINK),
  url: z.string(),
  title: z.string().nullish(),
  description: z.string().nullish(),
  imageUrl: z.string().nullish(),
  imageAssetId: z.string().nullish(),
  screenshotAssetId: z.string().nullish(),
  pdfAssetId: z.string().nullish(),
  fullPageArchiveAssetId: z.string().nullish(),
  precrawledArchiveAssetId: z.string().nullish(),
  videoAssetId: z.string().nullish(),
  favicon: z.string().nullish(),
  htmlContent: z.string().nullish(),
  contentAssetId: z.string().nullish(),
  crawledAt: z.date().nullish(),
  crawlStatus: z.enum(["success", "failure", "pending"]).nullish(),
  author: z.string().nullish(),
  publisher: z.string().nullish(),
  datePublished: z.date().nullish(),
  dateModified: z.date().nullish(),
});
export type ZBookmarkedLink = z.infer<typeof zBookmarkedLinkSchema>;

export const zBookmarkedTextSchema = z.object({
  type: z.literal(BookmarkTypes.TEXT),
  text: z.string(),
  sourceUrl: z.string().nullish(),
});
export type ZBookmarkedText = z.infer<typeof zBookmarkedTextSchema>;

export const zBookmarkedAssetSchema = z.object({
  type: z.literal(BookmarkTypes.ASSET),
  assetType: z.enum(["image", "pdf"]),
  assetId: z.string(),
  fileName: z.string().nullish(),
  sourceUrl: z.string().nullish(),
  size: z.number().nullish(),
  content: z.string().nullish(),
});
export type ZBookmarkedAsset = z.infer<typeof zBookmarkedAssetSchema>;

export const zBookmarkContentSchema = z.discriminatedUnion("type", [
  zBookmarkedLinkSchema,
  zBookmarkedTextSchema,
  zBookmarkedAssetSchema,
  z.object({ type: z.literal(BookmarkTypes.UNKNOWN) }),
]);
export type ZBookmarkContent = z.infer<typeof zBookmarkContentSchema>;

export const zBookmarkSourceSchema = z.enum([
  "api",
  "web",
  "cli",
  "mobile",
  "extension",
  "singlefile",
  "rss",
  "import",
]);
export type ZBookmarkSource = z.infer<typeof zBookmarkSourceSchema>;

export const zBareBookmarkSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  lastSavedAt: z.date(),
  modifiedAt: z.date().nullable(),
  title: z.string().nullish(),
  archived: z.boolean(),
  favourited: z.boolean(),
  taggingStatus: z.enum(["success", "failure", "pending"]).nullable(),
  summarizationStatus: z.enum(["success", "failure", "pending"]).nullable(),
  note: z.string().nullish(),
  summary: z.string().nullish(),
  source: zBookmarkSourceSchema.nullish(),
  userId: z.string(),
});

export type ZBareBookmark = z.infer<typeof zBareBookmarkSchema>;

export const zBookmarkSchema = zBareBookmarkSchema.merge(
  z.object({
    tags: z.array(zBookmarkTagSchema),
    content: zBookmarkContentSchema,
    assets: z.array(zAssetSchema),
  }),
);
export type ZBookmark = z.infer<typeof zBookmarkSchema>;

const zBookmarkTypeLinkSchema = zBareBookmarkSchema.merge(
  z.object({
    tags: z.array(zBookmarkTagSchema),
    content: zBookmarkedLinkSchema,
    assets: z.array(zAssetSchema),
  }),
);
export type ZBookmarkTypeLink = z.infer<typeof zBookmarkTypeLinkSchema>;

const zBookmarkTypeTextSchema = zBareBookmarkSchema.merge(
  z.object({
    tags: z.array(zBookmarkTagSchema),
    content: zBookmarkedTextSchema,
    assets: z.array(zAssetSchema),
  }),
);
export type ZBookmarkTypeText = z.infer<typeof zBookmarkTypeTextSchema>;

const zBookmarkTypeAssetSchema = zBareBookmarkSchema.merge(
  z.object({
    tags: z.array(zBookmarkTagSchema),
    content: zBookmarkedAssetSchema,
    assets: z.array(zAssetSchema),
  }),
);
export type ZBookmarkTypeAsset = z.infer<typeof zBookmarkTypeAssetSchema>;

// POST /v1/bookmarks
export const zNewBookmarkRequestSchema = z
  .object({
    title: z.string().max(MAX_BOOKMARK_TITLE_LENGTH).nullish(),
    archived: z.boolean().optional(),
    favourited: z.boolean().optional(),
    note: z.string().optional(),
    summary: z.string().optional(),
    createdAt: z.coerce.date().optional(),
    // A mechanism to prioritize crawling of bookmarks depending on whether
    // they were created by a user interaction or by a bulk import.
    crawlPriority: z.enum(["low", "normal"]).optional(),
    // Deprecated
    importSessionId: z.string().optional(),
    source: zBookmarkSourceSchema.optional(),
  })
  .and(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal(BookmarkTypes.LINK),
        url: z.string().url(),
        precrawledArchiveId: z.string().optional(),
      }),
      z.object({
        type: z.literal(BookmarkTypes.TEXT),
        text: z.string(),
        sourceUrl: z.string().optional(),
      }),
      z.object({
        type: z.literal(BookmarkTypes.ASSET),
        assetType: z.enum(["image", "pdf"]),
        assetId: z.string(),
        fileName: z.string().optional(),
        sourceUrl: z.string().optional(),
      }),
    ]),
  );
export type ZNewBookmarkRequest = z.infer<typeof zNewBookmarkRequestSchema>;

// GET /v1/bookmarks

export const DEFAULT_NUM_BOOKMARKS_PER_PAGE = 20;
export const MAX_NUM_BOOKMARKS_PER_PAGE = 100;

export const zGetBookmarksRequestSchema = z.object({
  ids: z.array(z.string()).optional(),
  archived: z.boolean().optional(),
  favourited: z.boolean().optional(),
  tagId: z.string().optional(),
  listId: z.string().optional(),
  rssFeedId: z.string().optional(),
  limit: z.number().max(MAX_NUM_BOOKMARKS_PER_PAGE).optional(),
  cursor: zCursorV2.nullish(),
  // TODO: This was done for backward comptability. At this point, all clients should be settings this to true.
  // The value is currently not being used, but keeping it so that client can still set it to true for older
  // servers.
  useCursorV2: z.boolean().optional(),
  sortOrder: zSortOrder.exclude(["relevance"]).optional().default("desc"),
  includeContent: z.boolean().optional().default(false),
});
export type ZGetBookmarksRequest = z.infer<typeof zGetBookmarksRequestSchema>;

export const zGetBookmarksResponseSchema = z.object({
  bookmarks: z.array(zBookmarkSchema),
  nextCursor: zCursorV2.nullable(),
});
export type ZGetBookmarksResponse = z.infer<typeof zGetBookmarksResponseSchema>;

// PATCH /v1/bookmarks/[bookmarkId]
export const zUpdateBookmarksRequestSchema = z.object({
  bookmarkId: z.string(),
  archived: z.boolean().optional(),
  favourited: z.boolean().optional(),
  summary: z.string().nullish(),
  note: z.string().optional(),
  title: z.string().max(MAX_BOOKMARK_TITLE_LENGTH).nullish(),
  createdAt: z.coerce.date().optional(),
  // Link specific fields (optional)
  url: z.string().url().optional(),
  description: z.string().nullish(),
  author: z.string().nullish(),
  publisher: z.string().nullish(),
  datePublished: z.coerce.date().nullish(),
  dateModified: z.coerce.date().nullish(),

  // Text specific fields (optional)
  text: z.string().nullish(),

  // Asset specific fields (optional)
  assetContent: z.string().nullish(),
});
export type ZUpdateBookmarksRequest = z.infer<
  typeof zUpdateBookmarksRequestSchema
>;

// The schema that's used to for attachig/detaching tags
export const zManipulatedTagSchema = z
  .object({
    // At least one of the two must be set
    tagId: z.string().optional(), // If the tag already exists and we know its id we should pass it
    tagName: z.string().optional(),
    attachedBy: zAttachedByEnumSchema.optional().default("human"),
  })
  .refine((val) => !!val.tagId || !!val.tagName, {
    message: "You must provide either a tagId or a tagName",
    path: ["tagId", "tagName"],
  });

export const zSearchBookmarksCursor = z.discriminatedUnion("ver", [
  z.object({
    ver: z.literal(1),
    offset: z.number(),
  }),
]);
export const zSearchBookmarksRequestSchema = z.object({
  text: z.string(),
  limit: z.number().max(MAX_NUM_BOOKMARKS_PER_PAGE).optional(),
  cursor: zSearchBookmarksCursor.nullish(),
  sortOrder: zSortOrder.optional().default("relevance"),
  includeContent: z.boolean().optional().default(false),
});

export const zPublicBookmarkSchema = z.object({
  id: z.string(),
  createdAt: z.date(),
  modifiedAt: z.date().nullable(),
  title: z.string().nullish(),
  tags: z.array(z.string()),
  description: z.string().nullish(),
  bannerImageUrl: z.string().nullable(),
  content: z.discriminatedUnion("type", [
    z.object({
      type: z.literal(BookmarkTypes.LINK),
      url: z.string(),
      author: z.string().nullish(),
    }),
    z.object({
      type: z.literal(BookmarkTypes.TEXT),
      text: z.string(),
    }),
    z.object({
      type: z.literal(BookmarkTypes.ASSET),
      assetType: z.enum(["image", "pdf"]),
      assetId: z.string(),
      assetUrl: z.string(),
      fileName: z.string().nullish(),
      sourceUrl: z.string().nullish(),
    }),
  ]),
});

export type ZPublicBookmark = z.infer<typeof zPublicBookmarkSchema>;
