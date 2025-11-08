import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  lt,
  lte,
  or,
} from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  bookmarkTexts,
  rssFeedImportsTable,
  tagsOnBookmarks,
} from "@karakeep/db/schema";
import { readAsset } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import {
  createSignedToken,
  getAlignedExpiry,
} from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import {
  BookmarkTypes,
  DEFAULT_NUM_BOOKMARKS_PER_PAGE,
  ZBookmark,
  ZBookmarkContent,
  zGetBookmarksRequestSchema,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { ZCursor } from "@karakeep/shared/types/pagination";
import {
  getBookmarkLinkAssetIdOrUrl,
  getBookmarkTitle,
} from "@karakeep/shared/utils/bookmarkUtils";
import { htmlToPlainText } from "@karakeep/shared/utils/htmlUtils";

import { AuthedContext } from "..";
import { mapDBAssetTypeToUserType } from "../lib/attachments";
import { List } from "./lists";
import { PrivacyAware } from "./privacy";

export class Bookmark implements PrivacyAware {
  protected constructor(
    protected ctx: AuthedContext,
    public bookmark: ZBookmark & { userId: string },
  ) {}

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.bookmark.userId != ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  static fromData(ctx: AuthedContext, data: ZBookmark) {
    return new Bookmark(ctx, {
      ...data,
      userId: ctx.user.id,
    });
  }

  static async loadMulti(
    ctx: AuthedContext,
    input: z.infer<typeof zGetBookmarksRequestSchema>,
  ): Promise<{
    bookmarks: Bookmark[];
    nextCursor: ZCursor | null;
  }> {
    if (input.ids && input.ids.length == 0) {
      return { bookmarks: [], nextCursor: null };
    }
    if (!input.limit) {
      input.limit = DEFAULT_NUM_BOOKMARKS_PER_PAGE;
    }
    if (input.listId) {
      const list = await List.fromId(ctx, input.listId);
      if (list.type === "smart") {
        input.ids = await list.getBookmarkIds();
        delete input.listId;
      }
    }

    const sq = ctx.db.$with("bookmarksSq").as(
      ctx.db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            input.archived !== undefined
              ? eq(bookmarks.archived, input.archived)
              : undefined,
            input.favourited !== undefined
              ? eq(bookmarks.favourited, input.favourited)
              : undefined,
            input.ids ? inArray(bookmarks.id, input.ids) : undefined,
            input.tagId !== undefined
              ? exists(
                  ctx.db
                    .select()
                    .from(tagsOnBookmarks)
                    .where(
                      and(
                        eq(tagsOnBookmarks.bookmarkId, bookmarks.id),
                        eq(tagsOnBookmarks.tagId, input.tagId),
                      ),
                    ),
                )
              : undefined,
            input.rssFeedId !== undefined
              ? exists(
                  ctx.db
                    .select()
                    .from(rssFeedImportsTable)
                    .where(
                      and(
                        eq(rssFeedImportsTable.bookmarkId, bookmarks.id),
                        eq(rssFeedImportsTable.rssFeedId, input.rssFeedId),
                      ),
                    ),
                )
              : undefined,
            input.listId !== undefined
              ? exists(
                  ctx.db
                    .select()
                    .from(bookmarksInLists)
                    .where(
                      and(
                        eq(bookmarksInLists.bookmarkId, bookmarks.id),
                        eq(bookmarksInLists.listId, input.listId),
                      ),
                    ),
                )
              : undefined,
            input.cursor
              ? input.sortOrder === "asc"
                ? or(
                    gt(bookmarks.createdAt, input.cursor.createdAt),
                    and(
                      eq(bookmarks.createdAt, input.cursor.createdAt),
                      gte(bookmarks.id, input.cursor.id),
                    ),
                  )
                : or(
                    lt(bookmarks.createdAt, input.cursor.createdAt),
                    and(
                      eq(bookmarks.createdAt, input.cursor.createdAt),
                      lte(bookmarks.id, input.cursor.id),
                    ),
                  )
              : undefined,
          ),
        )
        .limit(input.limit + 1)
        .orderBy(
          input.sortOrder === "asc"
            ? asc(bookmarks.createdAt)
            : desc(bookmarks.createdAt),
          desc(bookmarks.id),
        ),
    );
    // TODO: Consider not inlining the tags in the response of getBookmarks as this query is getting kinda expensive
    const results = await ctx.db
      .with(sq)
      .select()
      .from(sq)
      .leftJoin(tagsOnBookmarks, eq(sq.id, tagsOnBookmarks.bookmarkId))
      .leftJoin(bookmarkTags, eq(tagsOnBookmarks.tagId, bookmarkTags.id))
      .leftJoin(bookmarkLinks, eq(bookmarkLinks.id, sq.id))
      .leftJoin(bookmarkTexts, eq(bookmarkTexts.id, sq.id))
      .leftJoin(bookmarkAssets, eq(bookmarkAssets.id, sq.id))
      .leftJoin(assets, eq(assets.bookmarkId, sq.id))
      .orderBy(desc(sq.createdAt), desc(sq.id));

    const bookmarksRes = results.reduce<Record<string, ZBookmark>>(
      (acc, row) => {
        const bookmarkId = row.bookmarksSq.id;
        if (!acc[bookmarkId]) {
          let content: ZBookmarkContent;
          if (row.bookmarkLinks) {
            content = {
              type: BookmarkTypes.LINK,
              url: row.bookmarkLinks.url,
              title: row.bookmarkLinks.title,
              description: row.bookmarkLinks.description,
              imageUrl: row.bookmarkLinks.imageUrl,
              favicon: row.bookmarkLinks.favicon,
              htmlContent: input.includeContent
                ? row.bookmarkLinks.contentAssetId
                  ? null // Will be populated later from asset
                  : row.bookmarkLinks.htmlContent
                : null,
              contentAssetId: row.bookmarkLinks.contentAssetId,
              crawledAt: row.bookmarkLinks.crawledAt,
              author: row.bookmarkLinks.author,
              publisher: row.bookmarkLinks.publisher,
              datePublished: row.bookmarkLinks.datePublished,
              dateModified: row.bookmarkLinks.dateModified,
            };
          } else if (row.bookmarkTexts) {
            content = {
              type: BookmarkTypes.TEXT,
              text: row.bookmarkTexts.text ?? "",
              sourceUrl: row.bookmarkTexts.sourceUrl ?? null,
            };
          } else if (row.bookmarkAssets) {
            content = {
              type: BookmarkTypes.ASSET,
              assetId: row.bookmarkAssets.assetId,
              assetType: row.bookmarkAssets.assetType,
              fileName: row.bookmarkAssets.fileName,
              sourceUrl: row.bookmarkAssets.sourceUrl ?? null,
              size: null, // This will get filled in the asset loop
              content: input.includeContent
                ? (row.bookmarkAssets.content ?? null)
                : null,
            };
          } else {
            content = {
              type: BookmarkTypes.UNKNOWN,
            };
          }
          acc[bookmarkId] = {
            ...row.bookmarksSq,
            content,
            tags: [],
            assets: [],
          };
        }

        if (
          row.bookmarkTags &&
          // Duplicates may occur because of the join, so we need to make sure we're not adding the same tag twice
          !acc[bookmarkId].tags.some((t) => t.id == row.bookmarkTags!.id)
        ) {
          invariant(
            row.tagsOnBookmarks,
            "if bookmark tag is set, its many-to-many relation must also be set",
          );
          acc[bookmarkId].tags.push({
            ...row.bookmarkTags,
            attachedBy: row.tagsOnBookmarks.attachedBy,
          });
        }

        if (
          row.assets &&
          !acc[bookmarkId].assets.some((a) => a.id == row.assets!.id)
        ) {
          if (acc[bookmarkId].content.type == BookmarkTypes.LINK) {
            const content = acc[bookmarkId].content;
            invariant(content.type == BookmarkTypes.LINK);
            if (row.assets.assetType == AssetTypes.LINK_SCREENSHOT) {
              content.screenshotAssetId = row.assets.id;
            }
            if (row.assets.assetType == AssetTypes.LINK_FULL_PAGE_ARCHIVE) {
              content.fullPageArchiveAssetId = row.assets.id;
            }
            if (row.assets.assetType == AssetTypes.LINK_BANNER_IMAGE) {
              content.imageAssetId = row.assets.id;
            }
            if (row.assets.assetType == AssetTypes.LINK_VIDEO) {
              content.videoAssetId = row.assets.id;
            }
            if (row.assets.assetType == AssetTypes.LINK_PRECRAWLED_ARCHIVE) {
              content.precrawledArchiveAssetId = row.assets.id;
            }
            acc[bookmarkId].content = content;
          }
          if (acc[bookmarkId].content.type == BookmarkTypes.ASSET) {
            const content = acc[bookmarkId].content;
            if (row.assets.id == content.assetId) {
              // If this is the bookmark's main aset, caputure its size.
              content.size = row.assets.size;
            }
          }
          acc[bookmarkId].assets.push({
            id: row.assets.id,
            assetType: mapDBAssetTypeToUserType(row.assets.assetType),
            fileName: row.assets.fileName,
          });
        }

        return acc;
      },
      {},
    );

    const bookmarksArr = Object.values(bookmarksRes);

    // Fetch HTML content from assets for bookmarks that have contentAssetId (large content)
    if (input.includeContent) {
      await Promise.all(
        bookmarksArr.map(async (bookmark) => {
          if (
            bookmark.content.type === BookmarkTypes.LINK &&
            bookmark.content.contentAssetId &&
            !bookmark.content.htmlContent // Only fetch if not already inline
          ) {
            try {
              const asset = await readAsset({
                userId: ctx.user.id,
                assetId: bookmark.content.contentAssetId,
              });
              bookmark.content.htmlContent = asset.asset.toString("utf8");
            } catch (error) {
              // If asset reading fails, keep htmlContent as null
              console.warn(
                `Failed to read HTML content asset ${bookmark.content.contentAssetId}:`,
                error,
              );
            }
          }
        }),
      );
    }

    bookmarksArr.sort((a, b) => {
      if (a.createdAt != b.createdAt) {
        return input.sortOrder === "asc"
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime();
      } else {
        return b.id.localeCompare(a.id);
      }
    });

    bookmarksArr.forEach((b) => {
      b.tags.sort((a, b) =>
        a.attachedBy === "ai" ? 1 : b.attachedBy === "ai" ? -1 : 0,
      );
    });

    let nextCursor = null;
    if (bookmarksArr.length > input.limit) {
      const nextItem = bookmarksArr.pop()!;
      nextCursor = {
        id: nextItem.id,
        createdAt: nextItem.createdAt,
      };
    }

    return {
      bookmarks: bookmarksArr.map((b) => Bookmark.fromData(ctx, b)),
      nextCursor,
    };
  }

  asZBookmark(): ZBookmark {
    return this.bookmark;
  }

  asPublicBookmark(): ZPublicBookmark {
    const getPublicSignedAssetUrl = (assetId: string) => {
      const payload: z.infer<typeof zAssetSignedTokenSchema> = {
        assetId,
        userId: this.ctx.user.id,
      };
      const signedToken = createSignedToken(
        payload,
        serverConfig.signingSecret(),
        // Tokens will expire in 1 hour and will have a grace period of 15mins
        getAlignedExpiry(/* interval */ 3600, /* grace */ 900),
      );
      return `${serverConfig.publicApiUrl}/public/assets/${assetId}?token=${signedToken}`;
    };
    const getContent = (
      content: ZBookmarkContent,
    ): ZPublicBookmark["content"] => {
      switch (content.type) {
        case BookmarkTypes.LINK: {
          return {
            type: BookmarkTypes.LINK,
            url: content.url,
          };
        }
        case BookmarkTypes.TEXT: {
          return {
            type: BookmarkTypes.TEXT,
            text: content.text,
          };
        }
        case BookmarkTypes.ASSET: {
          return {
            type: BookmarkTypes.ASSET,
            assetType: content.assetType,
            assetId: content.assetId,
            assetUrl: getPublicSignedAssetUrl(content.assetId),
            fileName: content.fileName,
            sourceUrl: content.sourceUrl,
          };
        }
        default: {
          throw new Error("Unknown bookmark content type");
        }
      }
    };

    const getBannerImageUrl = (content: ZBookmarkContent): string | null => {
      switch (content.type) {
        case BookmarkTypes.LINK: {
          const assetIdOrUrl = getBookmarkLinkAssetIdOrUrl(content);
          if (!assetIdOrUrl) {
            return null;
          }
          if (assetIdOrUrl.localAsset) {
            return getPublicSignedAssetUrl(assetIdOrUrl.assetId);
          } else {
            return assetIdOrUrl.url;
          }
        }
        case BookmarkTypes.TEXT: {
          return null;
        }
        case BookmarkTypes.ASSET: {
          switch (content.assetType) {
            case "image":
              return `${getPublicSignedAssetUrl(content.assetId)}`;
            case "pdf": {
              const screenshotAssetId = this.bookmark.assets.find(
                (r) => r.assetType === "assetScreenshot",
              )?.id;
              if (!screenshotAssetId) {
                return null;
              }
              return getPublicSignedAssetUrl(screenshotAssetId);
            }
            default: {
              const _exhaustiveCheck: never = content.assetType;
              return null;
            }
          }
        }
        default: {
          throw new Error("Unknown bookmark content type");
        }
      }
    };

    // WARNING: Everything below is exposed in the public APIs, don't use spreads!
    return {
      id: this.bookmark.id,
      createdAt: this.bookmark.createdAt,
      modifiedAt: this.bookmark.modifiedAt,
      title: getBookmarkTitle(this.bookmark),
      tags: this.bookmark.tags.map((t) => t.name),
      content: getContent(this.bookmark.content),
      bannerImageUrl: getBannerImageUrl(this.bookmark.content),
    };
  }

  static async getBookmarkHtmlContent(
    {
      contentAssetId,
      htmlContent,
    }: {
      contentAssetId: string | null;
      htmlContent: string | null;
    },
    userId: string,
  ): Promise<string | null> {
    if (contentAssetId) {
      // Read large HTML content from asset
      const asset = await readAsset({
        userId,
        assetId: contentAssetId,
      });
      return asset.asset.toString("utf8");
    } else if (htmlContent) {
      return htmlContent;
    }
    return null;
  }

  static async getBookmarkPlainTextContent(
    {
      contentAssetId,
      htmlContent,
    }: {
      contentAssetId: string | null;
      htmlContent: string | null;
    },
    userId: string,
  ): Promise<string | null> {
    const content = await this.getBookmarkHtmlContent(
      {
        contentAssetId,
        htmlContent,
      },
      userId,
    );
    if (!content) {
      return null;
    }
    return htmlToPlainText(content);
  }
}
