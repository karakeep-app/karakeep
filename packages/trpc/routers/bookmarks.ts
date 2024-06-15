import { experimental_trpcMiddleware, TRPCError } from "@trpc/server";
import { and, desc, eq, exists, inArray, lt, lte, or } from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import type {
  ZBookmark,
  ZBookmarkContent,
} from "@hoarder/shared/types/bookmarks";
import type { ZBookmarkTags } from "@hoarder/shared/types/tags";
import { db as DONT_USE_db } from "@hoarder/db";
import {
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  bookmarkTexts,
  tagsOnBookmarks,
} from "@hoarder/db/schema";
import { deleteAsset } from "@hoarder/shared/assetdb";
import {
  LinkCrawlerQueue,
  OpenAIQueue,
  triggerSearchDeletion,
  triggerSearchReindex,
} from "@hoarder/shared/queues";
import { getSearchIdxClient } from "@hoarder/shared/search";
import {
  DEFAULT_NUM_BOOKMARKS_PER_PAGE,
  zBareBookmarkSchema,
  zBookmarkSchema,
  zGetBookmarksRequestSchema,
  zGetBookmarksResponseSchema,
  zNewBookmarkRequestSchema,
  zUpdateBookmarksRequestSchema,
} from "@hoarder/shared/types/bookmarks";

import type { AuthedContext, Context } from "../index";
import { authedProcedure, router } from "../index";

export const ensureBookmarkOwnership = experimental_trpcMiddleware<{
  ctx: Context;
  input: { bookmarkId: string };
}>().create(async (opts) => {
  const bookmark = await opts.ctx.db.query.bookmarks.findFirst({
    where: eq(bookmarks.id, opts.input.bookmarkId),
    columns: {
      userId: true,
    },
  });
  if (!opts.ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User is not authorized",
    });
  }
  if (!bookmark) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Bookmark not found",
    });
  }
  if (bookmark.userId != opts.ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "User is not allowed to access resource",
    });
  }

  return opts.next();
});

async function getBookmark(ctx: AuthedContext, bookmarkId: string) {
  const bookmark = await ctx.db.query.bookmarks.findFirst({
    where: and(eq(bookmarks.userId, ctx.user.id), eq(bookmarks.id, bookmarkId)),
    with: {
      tagsOnBookmarks: {
        with: {
          tag: true,
        },
      },
      link: true,
      text: true,
      asset: true,
    },
  });
  if (!bookmark) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Bookmark not found",
    });
  }

  return toZodSchema(bookmark);
}

async function attemptToDedupLink(ctx: AuthedContext, url: string) {
  const result = await ctx.db
    .select({
      id: bookmarkLinks.id,
    })
    .from(bookmarkLinks)
    .leftJoin(bookmarks, eq(bookmarks.id, bookmarkLinks.id))
    .where(and(eq(bookmarkLinks.url, url), eq(bookmarks.userId, ctx.user.id)));

  if (result.length == 0) {
    return null;
  }
  return getBookmark(ctx, result[0].id);
}

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

async function cleanupAssetForBookmark(
  bookmark: Pick<BookmarkQueryReturnType, "asset" | "link" | "userId">,
) {
  const assetIds = [];
  if (bookmark.asset) {
    assetIds.push(bookmark.asset.assetId);
  }
  if (bookmark.link) {
    if (bookmark.link.screenshotAssetId) {
      assetIds.push(bookmark.link.screenshotAssetId);
    }
    if (bookmark.link.imageAssetId) {
      assetIds.push(bookmark.link.imageAssetId);
    }
    if (bookmark.link.fullPageArchiveAssetId) {
      assetIds.push(bookmark.link.fullPageArchiveAssetId);
    }
  }
  await Promise.all(
    assetIds.map((assetId) =>
      deleteAsset({ userId: bookmark.userId, assetId }),
    ),
  );
}

function toZodSchema(bookmark: BookmarkQueryReturnType): ZBookmark {
  const { tagsOnBookmarks, link, text, asset, ...rest } = bookmark;

  let content: ZBookmarkContent;
  if (link) {
    content = { type: "link", ...link };
  } else if (text) {
    content = { type: "text", text: text.text ?? "" };
  } else if (asset) {
    content = {
      type: "asset",
      assetType: asset.assetType,
      assetId: asset.assetId,
      fileName: asset.fileName,
    };
  } else {
    content = { type: "unknown" };
  }

  return {
    tags: tagsOnBookmarks.map((t) => ({
      attachedBy: t.attachedBy,
      ...t.tag,
    })),
    content,
    ...rest,
  };
}

export const bookmarksAppRouter = router({
  createBookmark: authedProcedure
    .input(zNewBookmarkRequestSchema)
    .output(
      zBookmarkSchema.merge(
        z.object({
          alreadyExists: z.boolean().optional().default(false),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      if (input.type == "link") {
        // This doesn't 100% protect from duplicates because of races but it's more than enough for this usecase.
        const alreadyExists = await attemptToDedupLink(ctx, input.url);
        if (alreadyExists) {
          return { ...alreadyExists, alreadyExists: true };
        }
      } else if (input.type === "text") {
        if (!input.text) {
          throw new TRPCError({
            message: "Creating empty bookmarks is not allowed",
            code: "BAD_REQUEST",
          });
        }
      }
      const bookmark = await ctx.db.transaction(async (tx) => {
        const bookmark = (
          await tx
            .insert(bookmarks)
            .values({
              userId: ctx.user.id,
            })
            .returning()
        )[0];

        let content: ZBookmarkContent;

        switch (input.type) {
          case "link": {
            const link = (
              await tx
                .insert(bookmarkLinks)
                .values({
                  id: bookmark.id,
                  url: input.url.trim(),
                })
                .returning()
            )[0];
            content = {
              type: "link",
              ...link,
            };
            break;
          }
          case "text": {
            const text = (
              await tx
                .insert(bookmarkTexts)
                .values({ id: bookmark.id, text: input.text })
                .returning()
            )[0];
            content = {
              type: "text",
              text: text.text ?? "",
            };
            break;
          }
          case "asset": {
            const [asset] = await tx
              .insert(bookmarkAssets)
              .values({
                id: bookmark.id,
                assetType: input.assetType,
                assetId: input.assetId,
                content: null,
                metadata: null,
                fileName: input.fileName ?? null,
              })
              .returning();
            content = {
              type: "asset",
              assetType: asset.assetType,
              assetId: asset.assetId,
            };
            break;
          }
          case "unknown": {
            throw new TRPCError({ code: "BAD_REQUEST" });
          }
        }

        return {
          alreadyExists: false,
          tags: [] as ZBookmarkTags[],
          content,
          ...bookmark,
        };
      });

      // Enqueue crawling request
      switch (bookmark.content.type) {
        case "link": {
          // The crawling job triggers openai when it's done
          await LinkCrawlerQueue.add("crawl", {
            bookmarkId: bookmark.id,
          });
          break;
        }
        case "text":
        case "asset": {
          await OpenAIQueue.add("openai", {
            bookmarkId: bookmark.id,
          });
          break;
        }
      }
      triggerSearchReindex(bookmark.id);
      return bookmark;
    }),

  updateBookmark: authedProcedure
    .input(zUpdateBookmarksRequestSchema)
    .output(zBareBookmarkSchema)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db
        .update(bookmarks)
        .set({
          title: input.title,
          archived: input.archived,
          favourited: input.favourited,
          note: input.note,
        })
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            eq(bookmarks.id, input.bookmarkId),
          ),
        )
        .returning();
      if (res.length == 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found",
        });
      }
      triggerSearchReindex(input.bookmarkId);
      return res[0];
    }),

  updateBookmarkText: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        text: z.string().max(2000),
      }),
    )
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const res = await ctx.db
        .update(bookmarkTexts)
        .set({
          text: input.text,
        })
        .where(and(eq(bookmarkTexts.id, input.bookmarkId)))
        .returning();
      if (res.length == 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bookmark not found",
        });
      }
      triggerSearchReindex(input.bookmarkId);
    }),

  deleteBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      const bookmark = await ctx.db.query.bookmarks.findFirst({
        where: and(
          eq(bookmarks.id, input.bookmarkId),
          eq(bookmarks.userId, ctx.user.id),
        ),
        with: {
          asset: true,
          link: true,
        },
      });
      const deleted = await ctx.db
        .delete(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            eq(bookmarks.id, input.bookmarkId),
          ),
        );
      triggerSearchDeletion(input.bookmarkId);
      if (deleted.changes > 0 && bookmark) {
        await cleanupAssetForBookmark({
          asset: bookmark.asset,
          link: bookmark.link,
          userId: ctx.user.id,
        });
      }
    }),
  recrawlBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input }) => {
      await LinkCrawlerQueue.add("crawl", {
        bookmarkId: input.bookmarkId,
      });
    }),
  getBookmark: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
      }),
    )
    .output(zBookmarkSchema)
    .use(ensureBookmarkOwnership)
    .query(async ({ input, ctx }) => {
      return await getBookmark(ctx, input.bookmarkId);
    }),
  searchBookmarks: authedProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .output(zGetBookmarksResponseSchema)
    .query(async ({ input, ctx }) => {
      const client = await getSearchIdxClient();
      if (!client) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Search functionality is not configured",
        });
      }
      const resp = await client.search(input.text, {
        filter: [`userId = '${ctx.user.id}'`],
        showRankingScore: true,
        attributesToRetrieve: ["id"],
        sort: ["createdAt:desc"],
      });

      if (resp.hits.length == 0) {
        return { bookmarks: [], nextCursor: null };
      }
      const idToRank = resp.hits.reduce<Record<string, number>>((acc, r) => {
        acc[r.id] = r._rankingScore!;
        return acc;
      }, {});
      const results = await ctx.db.query.bookmarks.findMany({
        where: and(
          eq(bookmarks.userId, ctx.user.id),
          inArray(
            bookmarks.id,
            resp.hits.map((h) => h.id),
          ),
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
        },
      });
      results.sort((a, b) => idToRank[b.id] - idToRank[a.id]);

      return { bookmarks: results.map(toZodSchema), nextCursor: null };
    }),
  getBookmarks: authedProcedure
    .input(zGetBookmarksRequestSchema)
    .output(zGetBookmarksResponseSchema)
    .query(async ({ input, ctx }) => {
      if (input.ids && input.ids.length == 0) {
        return { bookmarks: [], nextCursor: null };
      }
      if (!input.limit) {
        input.limit = DEFAULT_NUM_BOOKMARKS_PER_PAGE;
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
                ? input.cursor instanceof Date
                  ? lte(bookmarks.createdAt, input.cursor)
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
          .orderBy(desc(bookmarks.createdAt), desc(bookmarks.id)),
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
        .orderBy(desc(sq.createdAt), desc(sq.id));

      const bookmarksRes = results.reduce<Record<string, ZBookmark>>(
        (acc, row) => {
          const bookmarkId = row.bookmarksSq.id;
          if (!acc[bookmarkId]) {
            let content: ZBookmarkContent;
            if (row.bookmarkLinks) {
              content = { type: "link", ...row.bookmarkLinks };
            } else if (row.bookmarkTexts) {
              content = { type: "text", text: row.bookmarkTexts.text ?? "" };
            } else if (row.bookmarkAssets) {
              content = {
                type: "asset",
                assetId: row.bookmarkAssets.assetId,
                assetType: row.bookmarkAssets.assetType,
                fileName: row.bookmarkAssets.fileName,
              };
            } else {
              content = { type: "unknown" };
            }
            acc[bookmarkId] = {
              ...row.bookmarksSq,
              content,
              tags: [],
            };
          }

          if (row.bookmarkTags) {
            invariant(
              row.tagsOnBookmarks,
              "if bookmark tag is set, its many-to-many relation must also be set",
            );
            acc[bookmarkId].tags.push({
              ...row.bookmarkTags,
              attachedBy: row.tagsOnBookmarks.attachedBy,
            });
          }

          return acc;
        },
        {},
      );

      const bookmarksArr = Object.values(bookmarksRes);

      bookmarksArr.sort((a, b) => {
        if (a.createdAt != b.createdAt) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        } else {
          return b.id.localeCompare(a.id);
        }
      });

      let nextCursor = null;
      if (bookmarksArr.length > input.limit) {
        const nextItem = bookmarksArr.pop()!;
        if (input.useCursorV2) {
          nextCursor = {
            id: nextItem.id,
            createdAt: nextItem.createdAt,
          };
        } else {
          nextCursor = nextItem.createdAt;
        }
      }

      return { bookmarks: bookmarksArr, nextCursor };
    }),

  updateTags: authedProcedure
    .input(
      z.object({
        bookmarkId: z.string(),
        attach: z.array(
          z.object({
            // At least one of the two must be set
            tagId: z.string().optional(), // If the tag already exists and we know its id we should pass it
            tagName: z.string().optional(),
          }),
        ),
        // Detach by tag ids
        detach: z.array(z.object({ tagId: z.string() })),
      }),
    )
    .output(
      z.object({
        attached: z.array(z.string()),
        detached: z.array(z.string()),
      }),
    )
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      return await ctx.db.transaction(async (tx) => {
        // Detaches
        if (input.detach.length > 0) {
          await tx.delete(tagsOnBookmarks).where(
            and(
              eq(tagsOnBookmarks.bookmarkId, input.bookmarkId),
              inArray(
                tagsOnBookmarks.tagId,
                input.detach.map((t) => t.tagId),
              ),
            ),
          );
        }

        if (input.attach.length == 0) {
          return {
            bookmarkId: input.bookmarkId,
            attached: [],
            detached: input.detach.map((t) => t.tagId),
          };
        }

        const toAddTagNames = input.attach.flatMap((i) =>
          i.tagName ? [i.tagName] : [],
        );
        const toAddTagIds = input.attach.flatMap((i) =>
          i.tagId ? [i.tagId] : [],
        );

        // New Tags
        if (toAddTagNames.length > 0) {
          await tx
            .insert(bookmarkTags)
            .values(
              toAddTagNames.map((name) => ({ name, userId: ctx.user.id })),
            )
            .onConflictDoNothing()
            .returning();
        }

        const allIds = (
          await tx.query.bookmarkTags.findMany({
            where: and(
              eq(bookmarkTags.userId, ctx.user.id),
              or(
                toAddTagIds.length > 0
                  ? inArray(bookmarkTags.id, toAddTagIds)
                  : undefined,
                toAddTagNames.length > 0
                  ? inArray(bookmarkTags.name, toAddTagNames)
                  : undefined,
              ),
            ),
            columns: {
              id: true,
            },
          })
        ).map((t) => t.id);

        await tx
          .insert(tagsOnBookmarks)
          .values(
            allIds.map((i) => ({
              tagId: i,
              bookmarkId: input.bookmarkId,
              attachedBy: "human" as const,
              userId: ctx.user.id,
            })),
          )
          .onConflictDoNothing();
        triggerSearchReindex(input.bookmarkId);
        return {
          bookmarkId: input.bookmarkId,
          attached: allIds,
          detached: input.detach.map((t) => t.tagId),
        };
      });
    }),
});
