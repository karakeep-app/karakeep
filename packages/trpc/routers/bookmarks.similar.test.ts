import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { bookmarks } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

const similarMocks = vi.hoisted(() => ({
  findSimilar: vi.fn(),
  getVectorStoreClient: vi.fn(),
}));

vi.mock("@karakeep/shared/vectorStore", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/vectorStore")>()),
  getVectorStoreClient: similarMocks.getVectorStoreClient,
}));

beforeEach<CustomTestContext>(async (context) => {
  await defaultBeforeEach(true)(context);
  similarMocks.findSimilar.mockReset();
  similarMocks.getVectorStoreClient.mockReset();
  similarMocks.getVectorStoreClient.mockResolvedValue({
    findSimilar: similarMocks.findSimilar,
  });
});

async function createTextBookmark(
  context: CustomTestContext,
  text: string,
  userId = 0,
) {
  return await context.apiCallers[userId].bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text,
  });
}

async function markEmbedded(context: CustomTestContext, bookmarkId: string) {
  await context.db
    .update(bookmarks)
    .set({ embeddingStatus: "success" })
    .where(eq(bookmarks.id, bookmarkId));
}

async function createEmbeddedBookmark(
  context: CustomTestContext,
  text: string,
) {
  const bookmark = await createTextBookmark(context, text);
  await markEmbedded(context, bookmark.id);
  return bookmark;
}

describe("getSimilarBookmarks", () => {
  test<CustomTestContext>("returns neighbours in similarity order and excludes the anchor", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    const [closest, further] = await Promise.all([
      createEmbeddedBookmark(context, "closest"),
      createEmbeddedBookmark(context, "further"),
    ]);
    similarMocks.findSimilar.mockResolvedValue({
      hits: [
        { id: closest.id, score: 0.95 },
        { id: source.id, score: 0.9 },
        { id: further.id, score: 0.8 },
      ],
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
    });

    expect(result.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      closest.id,
      further.id,
    ]);
    expect(result.nextCursor).toBeNull();
    expect(similarMocks.findSimilar).toHaveBeenCalledWith({
      id: source.id,
      filter: [
        {
          type: "eq",
          field: "userId",
          value: expect.any(String),
        },
      ],
      limit: 21,
      offset: 0,
    });
  });

  test<CustomTestContext>("paginates through neighbours", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    const [first, second, third] = await Promise.all([
      createEmbeddedBookmark(context, "first"),
      createEmbeddedBookmark(context, "second"),
      createEmbeddedBookmark(context, "third"),
    ]);
    similarMocks.findSimilar.mockResolvedValue({
      hits: [
        { id: first.id, score: 0.9 },
        { id: second.id, score: 0.8 },
        { id: third.id, score: 0.7 },
      ],
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
      limit: 2,
    });

    expect(result.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(result.nextCursor).toEqual({ offset: 2 });
    expect(similarMocks.findSimilar).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, offset: 0 }),
    );
  });

  test<CustomTestContext>("passes the cursor offset to the vector store", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    const next = await createEmbeddedBookmark(context, "next");
    similarMocks.findSimilar.mockResolvedValue({
      hits: [{ id: next.id, score: 0.8 }],
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
      limit: 2,
      cursor: { offset: 20 },
    });

    expect(result.bookmarks.map((bookmark) => bookmark.id)).toEqual([next.id]);
    expect(result.nextCursor).toBeNull();
    expect(similarMocks.findSimilar).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, offset: 20 }),
    );
  });

  test<CustomTestContext>("hides archived bookmarks", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    const [archived, visible] = await Promise.all([
      createEmbeddedBookmark(context, "archived"),
      createEmbeddedBookmark(context, "visible"),
    ]);
    await context.db
      .update(bookmarks)
      .set({ archived: true })
      .where(eq(bookmarks.id, archived.id));
    similarMocks.findSimilar.mockResolvedValue({
      hits: [
        { id: archived.id, score: 0.9 },
        { id: visible.id, score: 0.8 },
      ],
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
    });

    expect(result.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      visible.id,
    ]);
    expect(result.nextCursor).toBeNull();
  });

  test<CustomTestContext>("scans past a page that only contains archived bookmarks", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    const [archivedOne, archivedTwo, visible] = await Promise.all([
      createEmbeddedBookmark(context, "archived one"),
      createEmbeddedBookmark(context, "archived two"),
      createEmbeddedBookmark(context, "visible"),
    ]);
    await context.db
      .update(bookmarks)
      .set({ archived: true })
      .where(inArray(bookmarks.id, [archivedOne.id, archivedTwo.id]));
    similarMocks.findSimilar
      .mockResolvedValueOnce({
        hits: [
          { id: archivedOne.id, score: 0.9 },
          { id: archivedTwo.id, score: 0.8 },
        ],
        processingTimeMs: 1,
      })
      .mockResolvedValueOnce({
        hits: [{ id: visible.id, score: 0.7 }],
        processingTimeMs: 1,
      });

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
      limit: 1,
    });

    expect(result.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      visible.id,
    ]);
    expect(result.nextCursor).toEqual({ offset: 3 });
    expect(similarMocks.findSimilar).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 2, offset: 2 }),
    );
  });

  test<CustomTestContext>("returns nothing while the bookmark is not embedded yet", async (context) => {
    const { apiCallers } = context;
    const source = await createTextBookmark(context, "source");

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
    });

    expect(result).toEqual({ bookmarks: [], nextCursor: null });
    expect(similarMocks.findSimilar).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("returns nothing when the vector store is unavailable", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    similarMocks.getVectorStoreClient.mockResolvedValue(null);

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
    });

    expect(result).toEqual({ bookmarks: [], nextCursor: null });
    expect(similarMocks.findSimilar).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("degrades gracefully when the vector query fails", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");
    similarMocks.findSimilar.mockRejectedValue(new Error("index unavailable"));

    const result = await apiCallers[0].bookmarks.getSimilarBookmarks({
      bookmarkId: source.id,
    });

    expect(result).toEqual({ bookmarks: [], nextCursor: null });
  });

  test<CustomTestContext>("is only available to the bookmark owner", async (context) => {
    const { apiCallers } = context;
    const source = await createEmbeddedBookmark(context, "source");

    await expect(
      apiCallers[1].bookmarks.getSimilarBookmarks({
        bookmarkId: source.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(similarMocks.findSimilar).not.toHaveBeenCalled();
  });
});
