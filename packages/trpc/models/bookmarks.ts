import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  lt,
  lte,
  or,
  SQL,
} from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import { db as DONT_USE_db } from "@karakeep/db";
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
import { SearchIndexingQueue, triggerWebhook } from "@karakeep/shared-server";
import { deleteAsset, readAsset } from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import {
  createSignedToken,
  getAlignedExpiry,
} from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import {
  BookmarkTypes,
  DEFAULT_NUM_BOOKMARKS_PER_PAGE,
  ZBareBookmark,
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

async function dummyDrizzleReturnType() {
  const x = await DONT_USE_db.query.bookmarks.findFirst({
    with: {
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
      link: true,
      text: true,
      asset: true,
      assets: true,
    },
  });
  if (!x) {
    throw new Error();
  }
  return x;
}

type BookmarkQueryReturnType = Awaited<
  ReturnType<typeof dummyDrizzleReturnType>
>;

export class BareBookmark {
  protected constructor(
    protected ctx: AuthedContext,
    private bareBookmark: ZBareBookmark,
  ) {}

  get id() {
    return this.bareBookmark.id;
  }

  get createdAt() {
    return this.bareBookmark.createdAt;
  }

  static async bareFromId(ctx: AuthedContext, bookmarkId: string) {
    const bookmark = await ctx.db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
    });

    if (!bookmark) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Bookmark not found",
      });
    }

    if (!(await BareBookmark.isAllowedToAccessBookmark(ctx, bookmark))) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Bookmark not found",
      });
    }

    return new BareBookmark(ctx, bookmark);
  }

  protected static async isAllowedToAccessBookmark(
    ctx: AuthedContext,
    { id: bookmarkId, userId: bookmarkOwnerId }: { id: string; userId: string },
  ): Promise<boolean> {
    if (bookmarkOwnerId == ctx.user.id) {
      return true;
    }
    const bookmarkLists = await List.forBookmark(ctx, bookmarkId);
    return bookmarkLists.some((l) => l.canUserView());
  }

  ensureOwnership() {
    if (this.bareBookmark.userId != this.ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }
}

export class Bookmark extends BareBookmark {
  protected constructor(
    ctx: AuthedContext,
    private bookmark: ZBookmark,
  ) {
    super(ctx, bookmark);
  }

  private static async toZodSchema(
    bookmark: BookmarkQueryReturnType,
    includeContent: boolean,
  ): Promise<ZBookmark> {
    const { tagsOnBookmarks, link, text, asset, assets, ...rest } = bookmark;

    let content: ZBookmarkContent = {
      type: BookmarkTypes.UNKNOWN,
    };
    if (bookmark.link) {
      content = {
        type: BookmarkTypes.LINK,
        screenshotAssetId: assets.find(
          (a) => a.assetType == AssetTypes.LINK_SCREENSHOT,
        )?.id,
        pdfAssetId: assets.find((a) => a.assetType == AssetTypes.LINK_PDF)?.id,
        fullPageArchiveAssetId: assets.find(
          (a) => a.assetType == AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        )?.id,
        precrawledArchiveAssetId: assets.find(
          (a) => a.assetType == AssetTypes.LINK_PRECRAWLED_ARCHIVE,
        )?.id,
        imageAssetId: assets.find(
          (a) => a.assetType == AssetTypes.LINK_BANNER_IMAGE,
        )?.id,
        videoAssetId: assets.find((a) => a.assetType == AssetTypes.LINK_VIDEO)
          ?.id,
        url: link.url,
        title: link.title,
        description: link.description,
        imageUrl: link.imageUrl,
        favicon: link.favicon,
        htmlContent: includeContent
          ? await Bookmark.getBookmarkHtmlContent(link, bookmark.userId)
          : null,
        crawledAt: link.crawledAt,
        crawlStatus: link.crawlStatus,
        author: link.author,
        publisher: link.publisher,
        datePublished: link.datePublished,
        dateModified: link.dateModified,
      };
    }
    if (bookmark.text) {
      content = {
        type: BookmarkTypes.TEXT,
        // It's ok to include the text content as it's usually not big and is used to render the text bookmark card.
        text: text.text ?? "",
        sourceUrl: text.sourceUrl,
      };
    }
    if (bookmark.asset) {
      content = {
        type: BookmarkTypes.ASSET,
        assetType: asset.assetType,
        assetId: asset.assetId,
        fileName: asset.fileName,
        sourceUrl: asset.sourceUrl,
        size: assets.find((a) => a.id == asset.assetId)?.size,
        content: includeContent ? asset.content : null,
      };
    }

    return {
      tags: tagsOnBookmarks
        .map((t) => ({
          attachedBy: t.attachedBy,
          ...t.tag,
        }))
        .sort((a, b) =>
          a.attachedBy === "ai" ? 1 : b.attachedBy === "ai" ? -1 : 0,
        ),
      content,
      assets: assets.map((a) => ({
        id: a.id,
        assetType: mapDBAssetTypeToUserType(a.assetType),
        fileName: a.fileName,
      })),
      ...rest,
    };
  }

  static async fromId(
    ctx: AuthedContext,
    bookmarkId: string,
    includeContent: boolean,
  ) {
    const bookmark = await ctx.db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, bookmarkId),
      with: {
        tagsOnBookmarks: {
          with: {
            tag: true,
          },
        },
        link: true,
        text: true,
        asset: true,
        assets: true,
      },
    });

    if (!bookmark) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Bookmark not found",
      });
    }

    if (!(await BareBookmark.isAllowedToAccessBookmark(ctx, bookmark))) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Bookmark not found",
      });
    }
    return Bookmark.fromData(
      ctx,
      await Bookmark.toZodSchema(bookmark, includeContent),
    );
  }

  static fromData(ctx: AuthedContext, data: ZBookmark) {
    return new Bookmark(ctx, data);
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

    // Validate that only one of listId, tagId, or rssFeedId is specified
    // Combined filters are not supported as they would require different query strategies
    const filterCount = [input.listId, input.tagId, input.rssFeedId].filter(
      (f) => f !== undefined,
    ).length;
    if (filterCount > 1) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Cannot filter by multiple of listId, tagId, and rssFeedId simultaneously",
      });
    }

    // Handle smart lists by converting to bookmark IDs
    if (input.listId) {
      const list = await List.fromId(ctx, input.listId);
      if (list.type === "smart") {
        input.ids = await list.getBookmarkIds();
        delete input.listId;
      }
    }

    // Build cursor condition for pagination
    const buildCursorCondition = (
      createdAtCol: typeof bookmarks.createdAt,
      idCol: typeof bookmarks.id,
    ): SQL | undefined => {
      if (!input.cursor) return undefined;

      if (input.sortOrder === "asc") {
        return or(
          gt(createdAtCol, input.cursor.createdAt),
          and(
            eq(createdAtCol, input.cursor.createdAt),
            gte(idCol, input.cursor.id),
          ),
        );
      }
      return or(
        lt(createdAtCol, input.cursor.createdAt),
        and(
          eq(createdAtCol, input.cursor.createdAt),
          lte(idCol, input.cursor.id),
        ),
      );
    };

    // Build common filter conditions (archived, favourited, ids)
    const buildCommonFilters = (): (SQL | undefined)[] => [
      input.archived !== undefined
        ? eq(bookmarks.archived, input.archived)
        : undefined,
      input.favourited !== undefined
        ? eq(bookmarks.favourited, input.favourited)
        : undefined,
      input.ids ? inArray(bookmarks.id, input.ids) : undefined,
    ];

    // Build ORDER BY clause
    const buildOrderBy = () =>
      [
        input.sortOrder === "asc"
          ? asc(bookmarks.createdAt)
          : desc(bookmarks.createdAt),
        desc(bookmarks.id),
      ] as const;

    // Choose query strategy based on filters
    // Strategy: Use the most selective filter as the driving table
    let sq;

    if (input.listId !== undefined) {
      // PATH: List filter - start from bookmarksInLists (more selective)
      // Access control is already verified by List.fromId() called above
      sq = ctx.db.$with("bookmarksSq").as(
        ctx.db
          .select(getTableColumns(bookmarks))
          .from(bookmarksInLists)
          .innerJoin(bookmarks, eq(bookmarks.id, bookmarksInLists.bookmarkId))
          .where(
            and(
              eq(bookmarksInLists.listId, input.listId),
              ...buildCommonFilters(),
              buildCursorCondition(bookmarks.createdAt, bookmarks.id),
            ),
          )
          .limit(input.limit + 1)
          .orderBy(...buildOrderBy()),
      );
    } else if (input.tagId !== undefined) {
      // PATH: Tag filter - start from tagsOnBookmarks (more selective)
      sq = ctx.db.$with("bookmarksSq").as(
        ctx.db
          .select(getTableColumns(bookmarks))
          .from(tagsOnBookmarks)
          .innerJoin(bookmarks, eq(bookmarks.id, tagsOnBookmarks.bookmarkId))
          .where(
            and(
              eq(tagsOnBookmarks.tagId, input.tagId),
              eq(bookmarks.userId, ctx.user.id), // Access control
              ...buildCommonFilters(),
              buildCursorCondition(bookmarks.createdAt, bookmarks.id),
            ),
          )
          .limit(input.limit + 1)
          .orderBy(...buildOrderBy()),
      );
    } else if (input.rssFeedId !== undefined) {
      // PATH: RSS feed filter - start from rssFeedImportsTable (more selective)
      sq = ctx.db.$with("bookmarksSq").as(
        ctx.db
          .select(getTableColumns(bookmarks))
          .from(rssFeedImportsTable)
          .innerJoin(
            bookmarks,
            eq(bookmarks.id, rssFeedImportsTable.bookmarkId),
          )
          .where(
            and(
              eq(rssFeedImportsTable.rssFeedId, input.rssFeedId),
              eq(bookmarks.userId, ctx.user.id), // Access control
              ...buildCommonFilters(),
              buildCursorCondition(bookmarks.createdAt, bookmarks.id),
            ),
          )
          .limit(input.limit + 1)
          .orderBy(...buildOrderBy()),
      );
    } else {
      // PATH: No list/tag/rssFeed filter - query bookmarks directly
      // Uses composite index: bookmarks_userId_createdAt_id_idx (or archived/favourited variants)
      sq = ctx.db.$with("bookmarksSq").as(
        ctx.db
          .select()
          .from(bookmarks)
          .where(
            and(
              eq(bookmarks.userId, ctx.user.id),
              ...buildCommonFilters(),
              buildCursorCondition(bookmarks.createdAt, bookmarks.id),
            ),
          )
          .limit(input.limit + 1)
          .orderBy(...buildOrderBy()),
      );
    }

    // Execute the query with joins for related data
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
              crawlStatus: row.bookmarkLinks.crawlStatus,
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
            if (row.assets.assetType == AssetTypes.LINK_PDF) {
              content.pdfAssetId = row.assets.id;
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
                userId: bookmark.userId,
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
    if (this.bookmark.userId === this.ctx.user.id) {
      return this.bookmark;
    }

    // Collaborators shouldn't see owner-specific state such as favourites,
    // archived flag, or personal notes.
    return {
      ...this.bookmark,
      archived: false,
      favourited: false,
      note: null,
    };
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

  private async cleanupAssets() {
    const assetIds: Set<string> = new Set<string>(
      this.bookmark.assets.map((a) => a.id),
    );
    // Todo: Remove when the bookmark asset is also in the assets table
    if (this.bookmark.content.type == BookmarkTypes.ASSET) {
      assetIds.add(this.bookmark.content.assetId);
    }
    await Promise.all(
      Array.from(assetIds).map((assetId) =>
        deleteAsset({ userId: this.bookmark.userId, assetId }),
      ),
    );
  }

  async delete() {
    this.ensureOwnership();
    const deleted = await this.ctx.db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, this.ctx.user.id),
          eq(bookmarks.id, this.bookmark.id),
        ),
      );

    await SearchIndexingQueue.enqueue(
      {
        bookmarkId: this.bookmark.id,
        type: "delete",
      },
      {
        groupId: this.ctx.user.id,
      },
    );

    await triggerWebhook(this.bookmark.id, "deleted", this.ctx.user.id, {
      groupId: this.ctx.user.id,
    });
    if (deleted.changes > 0) {
      await this.cleanupAssets();
    }
  }
}
