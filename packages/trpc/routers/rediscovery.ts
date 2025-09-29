import { TRPCError } from "@trpc/server";
import { and, count, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import type {
  ZBookmark,
  ZBookmarkContent,
} from "@karakeep/shared/types/bookmarks";
import {
  AssetTypes,
  bookmarks as bookmarksTable,
  discoveryQueue,
} from "@karakeep/db/schema";
import {
  BookmarkTypes,
  zBookmarkSchema,
} from "@karakeep/shared/types/bookmarks";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { mapDBAssetTypeToUserType } from "../lib/attachments";
import { Bookmark } from "../models/bookmarks";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const DISCOVERY_QUEUE_SIZE = 10;

// Simple shuffle function to randomize array order
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Helper function to define the bookmark query structure for type inference
async function dummyRediscoveryDrizzleReturnType(db: AuthedContext["db"]) {
  const x = await db.query.bookmarks.findFirst({
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

type BookmarkQueryResult = Awaited<
  ReturnType<typeof dummyRediscoveryDrizzleReturnType>
>;

// Helper function to convert DB bookmark to Zod schema
async function toZodSchema(
  bookmark: BookmarkQueryResult,
  includeContent: boolean,
): Promise<ZBookmark> {
  const { tagsOnBookmarks, link, text, asset, assets, ...rest } = bookmark;

  let content: ZBookmarkContent = {
    type: BookmarkTypes.UNKNOWN,
  };
  if (bookmark.link && link) {
    content = {
      type: BookmarkTypes.LINK,
      screenshotAssetId: assets.find(
        (a) => a.assetType == AssetTypes.LINK_SCREENSHOT,
      )?.id,
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
      author: link.author,
      publisher: link.publisher,
      datePublished: link.datePublished,
      dateModified: link.dateModified,
    };
  }
  if (bookmark.text && text) {
    content = {
      type: BookmarkTypes.TEXT,
      text: text.text ?? "",
      sourceUrl: text.sourceUrl,
    };
  }
  if (bookmark.asset && asset) {
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
    tags: tagsOnBookmarks.map((t) => ({
      attachedBy: t.attachedBy,
      ...t.tag,
    })),
    content,
    assets: assets.map((a) => ({
      id: a.id,
      assetType: mapDBAssetTypeToUserType(a.assetType),
    })),
    ...rest,
  };
}

async function canAccessRediscovery(ctx: AuthedContext): Promise<boolean> {
  const bookmarkCount = await ctx.db
    .select({ count: count() })
    .from(bookmarksTable)
    .where(
      and(
        eq(bookmarksTable.userId, ctx.user.id),
        eq(bookmarksTable.archived, false),
      ),
    );

  return bookmarkCount[0].count >= DISCOVERY_QUEUE_SIZE;
}

async function checkRediscoveryStatus(ctx: AuthedContext) {
  const excludeThreshold = new Date(Date.now() - NINETY_DAYS_MS);

  // Get total unarchived bookmarks
  const totalBookmarks = await ctx.db
    .select({ count: count() })
    .from(bookmarksTable)
    .where(
      and(
        eq(bookmarksTable.userId, ctx.user.id),
        eq(bookmarksTable.archived, false),
      ),
    );

  // Get eligible bookmarks (not recently rediscovered)
  const eligibleBookmarks = await ctx.db
    .select({ count: count() })
    .from(bookmarksTable)
    .where(
      and(
        eq(bookmarksTable.userId, ctx.user.id),
        eq(bookmarksTable.archived, false),
        or(
          isNull(bookmarksTable.lastRediscoveredAt),
          lt(bookmarksTable.lastRediscoveredAt, excludeThreshold),
        ),
      ),
    );

  const total = totalBookmarks[0].count;
  const eligible = eligibleBookmarks[0].count;

  return {
    totalBookmarks: total,
    eligibleBookmarks: eligible,
    hasMinimumBookmarks: total >= DISCOVERY_QUEUE_SIZE,
    allRecentlyRediscovered: total >= DISCOVERY_QUEUE_SIZE && eligible === 0,
  };
}

async function selectBookmarksForDiscovery(ctx: AuthedContext) {
  const excludeThreshold = new Date(Date.now() - NINETY_DAYS_MS);

  const eligibleBookmarks = await ctx.db.query.bookmarks.findMany({
    where: and(
      eq(bookmarksTable.userId, ctx.user.id),
      eq(bookmarksTable.archived, false),
      or(
        isNull(bookmarksTable.lastRediscoveredAt),
        lt(bookmarksTable.lastRediscoveredAt, excludeThreshold),
      ),
    ),
    orderBy: (bookmarksTable, { asc }) => [asc(bookmarksTable.createdAt)],
    limit: DISCOVERY_QUEUE_SIZE,
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

  return eligibleBookmarks;
}

async function populateDiscoveryQueue(ctx: AuthedContext) {
  // Clear existing queue
  await ctx.db
    .delete(discoveryQueue)
    .where(eq(discoveryQueue.userId, ctx.user.id));

  // Select new bookmarks
  const selectedBookmarks = await selectBookmarksForDiscovery(ctx);

  if (selectedBookmarks.length === 0) {
    return [];
  }

  // Randomize the order of bookmarks for variety
  const shuffledBookmarks = shuffleArray(selectedBookmarks);

  // Add to queue with randomized positions
  await ctx.db.insert(discoveryQueue).values(
    shuffledBookmarks.map((bookmark, index) => ({
      userId: ctx.user.id,
      bookmarkId: bookmark.id,
      position: index,
    })),
  );

  return shuffledBookmarks;
}

export const rediscoveryAppRouter = router({
  canAccess: authedProcedure
    .output(
      z.object({
        canAccess: z.boolean(),
        message: z.string().optional(),
        allRecentlyRediscovered: z.boolean().optional(),
        totalBookmarks: z.number().optional(),
        eligibleBookmarks: z.number().optional(),
      }),
    )
    .query(async ({ ctx }) => {
      const status = await checkRediscoveryStatus(ctx);

      if (!status.hasMinimumBookmarks) {
        return {
          canAccess: false,
          message:
            "You are a very organised bookmark connoisseur! Come back again after you make mess!",
          allRecentlyRediscovered: false,
          totalBookmarks: status.totalBookmarks,
          eligibleBookmarks: status.eligibleBookmarks,
        };
      }

      return {
        canAccess: true,
        allRecentlyRediscovered: status.allRecentlyRediscovered,
        totalBookmarks: status.totalBookmarks,
        eligibleBookmarks: status.eligibleBookmarks,
      };
    }),

  getDiscoveryFeed: authedProcedure
    .output(
      z.object({
        bookmarks: z.array(zBookmarkSchema),
        hasMore: z.boolean(),
        allRecentlyRediscovered: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx }) => {
      const status = await checkRediscoveryStatus(ctx);

      if (!status.hasMinimumBookmarks) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient bookmarks for rediscovery feature",
        });
      }

      // Check if queue exists
      const existingQueue = await ctx.db.query.discoveryQueue.findMany({
        where: eq(discoveryQueue.userId, ctx.user.id),
        orderBy: (discoveryQueue, { asc }) => [asc(discoveryQueue.position)],
      });

      let bookmarksData: BookmarkQueryResult[];
      if (existingQueue.length === 0) {
        // No queue exists, create one
        bookmarksData = await populateDiscoveryQueue(ctx);
      } else {
        // Get bookmarks from existing queue
        const bookmarkIds = existingQueue.map((item) => item.bookmarkId);
        const queuedBookmarks = await ctx.db.query.bookmarks.findMany({
          where: and(
            eq(bookmarksTable.userId, ctx.user.id),
            inArray(bookmarksTable.id, bookmarkIds),
          ),
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

        // Sort bookmarks according to queue position
        const bookmarkMap = new Map(queuedBookmarks.map((b) => [b.id, b]));
        bookmarksData = existingQueue
          .map((item) => bookmarkMap.get(item.bookmarkId))
          .filter(
            (bookmark): bookmark is BookmarkQueryResult =>
              bookmark !== undefined,
          );
      }

      const bookmarks: ZBookmark[] = await Promise.all(
        bookmarksData.map((bookmark) => toZodSchema(bookmark, false)),
      );

      return {
        bookmarks,
        hasMore: bookmarks.length === DISCOVERY_QUEUE_SIZE,
        allRecentlyRediscovered:
          bookmarks.length === 0 && status.allRecentlyRediscovered,
      };
    }),

  regenerateDiscoveryFeed: authedProcedure
    .output(
      z.object({
        bookmarks: z.array(zBookmarkSchema),
        hasMore: z.boolean(),
        allRecentlyRediscovered: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx }) => {
      const status = await checkRediscoveryStatus(ctx);

      if (!status.hasMinimumBookmarks) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient bookmarks for rediscovery feature",
        });
      }

      const bookmarksData = await populateDiscoveryQueue(ctx);
      const bookmarks = await Promise.all(
        bookmarksData.map((bookmark) => toZodSchema(bookmark, false)),
      );

      return {
        bookmarks,
        hasMore: bookmarks.length === DISCOVERY_QUEUE_SIZE,
        allRecentlyRediscovered:
          bookmarks.length === 0 && status.allRecentlyRediscovered,
      };
    }),

  processSwipeAction: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        direction: z.enum(["left", "right", "up", "down"]),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
        action: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { bookmarkId, direction } = input;

      // Verify bookmark ownership
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: and(
          eq(bookmarksTable.id, bookmarkId),
          eq(bookmarksTable.userId, ctx.user.id),
        ),
      });

      if (!bookmark) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found",
        });
      }

      let action = "";
      let shouldRemoveFromQueue = false;

      switch (direction) {
        case "left":
          // Archive bookmark
          await ctx.db
            .update(bookmarksTable)
            .set({
              archived: true,
              lastRediscoveredAt: new Date(),
              modifiedAt: new Date(),
            })
            .where(eq(bookmarksTable.id, bookmarkId));
          action = "archived";
          shouldRemoveFromQueue = true;
          break;

        case "right":
          // Quick actions (placeholder for Phase 2)
          await ctx.db
            .update(bookmarksTable)
            .set({
              lastRediscoveredAt: new Date(),
              modifiedAt: new Date(),
            })
            .where(eq(bookmarksTable.id, bookmarkId));
          action = "quick_actions";
          shouldRemoveFromQueue = true;
          break;

        case "up":
          // Skip bookmark
          await ctx.db
            .update(bookmarksTable)
            .set({
              lastRediscoveredAt: new Date(),
            })
            .where(eq(bookmarksTable.id, bookmarkId));
          action = "skipped";
          shouldRemoveFromQueue = true;
          break;

        case "down":
          // Return to previous (no timestamp update)
          action = "returned";
          shouldRemoveFromQueue = false;
          break;
      }

      // Remove from queue if needed
      if (shouldRemoveFromQueue) {
        await ctx.db
          .delete(discoveryQueue)
          .where(
            and(
              eq(discoveryQueue.userId, ctx.user.id),
              eq(discoveryQueue.bookmarkId, bookmarkId),
            ),
          );
      }

      return {
        success: true,
        action,
      };
    }),

  undoLastAction: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        action: z.enum(["archived", "quick_actions", "skipped"]),
      }),
    )
    .output(
      z.object({
        success: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { bookmarkId, action } = input;

      // Verify bookmark ownership
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: and(
          eq(bookmarksTable.id, bookmarkId),
          eq(bookmarksTable.userId, ctx.user.id),
        ),
      });

      if (!bookmark) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found",
        });
      }

      switch (action) {
        case "archived":
          // Unarchive bookmark
          await ctx.db
            .update(bookmarksTable)
            .set({
              archived: false,
              modifiedAt: new Date(),
            })
            .where(eq(bookmarksTable.id, bookmarkId));
          break;

        case "quick_actions":
          // Undo quick actions (placeholder for Phase 2)
          break;

        case "skipped":
          // No specific undo action needed for skip
          break;
      }

      // Add back to queue at the beginning
      const maxPosition = await ctx.db.query.discoveryQueue.findFirst({
        where: eq(discoveryQueue.userId, ctx.user.id),
        orderBy: (discoveryQueue, { desc }) => [desc(discoveryQueue.position)],
        columns: { position: true },
      });

      await ctx.db.insert(discoveryQueue).values({
        userId: ctx.user.id,
        bookmarkId,
        position: (maxPosition?.position ?? -1) + 1,
      });

      return {
        success: true,
      };
    }),

  resetRediscoveryHistory: authedProcedure
    .output(
      z.object({
        success: z.boolean(),
        resetCount: z.number(),
      }),
    )
    .mutation(async ({ ctx }) => {
      const status = await checkRediscoveryStatus(ctx);

      if (!status.hasMinimumBookmarks) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient bookmarks for rediscovery feature",
        });
      }

      // Reset all lastRediscoveredAt timestamps for unarchived bookmarks
      await ctx.db
        .update(bookmarksTable)
        .set({
          lastRediscoveredAt: null,
          modifiedAt: new Date(),
        })
        .where(
          and(
            eq(bookmarksTable.userId, ctx.user.id),
            eq(bookmarksTable.archived, false),
          ),
        );

      // Clear existing queue so it gets regenerated
      await ctx.db
        .delete(discoveryQueue)
        .where(eq(discoveryQueue.userId, ctx.user.id));

      return {
        success: true,
        resetCount: status.totalBookmarks,
      };
    }),

  getNextBatch: authedProcedure
    .output(
      z.object({
        bookmarks: z.array(zBookmarkSchema),
        hasMore: z.boolean(),
      }),
    )
    .mutation(async ({ ctx }) => {
      if (!(await canAccessRediscovery(ctx))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient bookmarks for rediscovery feature",
        });
      }

      // Check current queue size
      const currentQueueSize = await ctx.db
        .select({ count: count() })
        .from(discoveryQueue)
        .where(eq(discoveryQueue.userId, ctx.user.id));

      if (currentQueueSize[0].count >= DISCOVERY_QUEUE_SIZE) {
        // Queue is full, return current queue
        const existingQueue = await ctx.db.query.discoveryQueue.findMany({
          where: eq(discoveryQueue.userId, ctx.user.id),
          orderBy: (discoveryQueue, { asc }) => [asc(discoveryQueue.position)],
        });

        const bookmarkIds = existingQueue.map((item) => item.bookmarkId);
        const queuedBookmarks = await ctx.db.query.bookmarks.findMany({
          where: and(
            eq(bookmarksTable.userId, ctx.user.id),
            inArray(bookmarksTable.id, bookmarkIds),
          ),
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

        const bookmarkMap = new Map(queuedBookmarks.map((b) => [b.id, b]));
        const bookmarksData = existingQueue
          .map((item) => bookmarkMap.get(item.bookmarkId))
          .filter(
            (bookmark): bookmark is BookmarkQueryResult =>
              bookmark !== undefined,
          );

        const bookmarks = await Promise.all(
          bookmarksData.map((bookmark) => toZodSchema(bookmark, false)),
        );

        return {
          bookmarks,
          hasMore: true,
        };
      }

      // Queue needs refilling
      const bookmarksData = await populateDiscoveryQueue(ctx);
      const bookmarks = await Promise.all(
        bookmarksData.map((bookmark) => toZodSchema(bookmark, false)),
      );

      return {
        bookmarks,
        hasMore: bookmarks.length === DISCOVERY_QUEUE_SIZE,
      };
    }),
});
