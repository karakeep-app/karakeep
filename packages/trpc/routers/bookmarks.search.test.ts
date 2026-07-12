import { beforeEach, describe, expect, test, vi } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

const searchMocks = vi.hoisted(() => ({
  search: vi.fn(),
  vectorSearch: vi.fn(),
  buildInferenceClient: vi.fn(),
  getVectorStoreClient: vi.fn(),
}));

vi.mock("@karakeep/shared/inference", () => ({
  InferenceClientFactory: {
    build: searchMocks.buildInferenceClient,
  },
}));

vi.mock("@karakeep/shared/search", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/search")>()),
  getSearchClient: vi.fn(async () => ({ search: searchMocks.search })),
}));

vi.mock("@karakeep/shared/vectorStore", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/vectorStore")>()),
  getVectorStoreClient: searchMocks.getVectorStoreClient,
}));

beforeEach<CustomTestContext>(async (context) => {
  await defaultBeforeEach(true)(context);
  searchMocks.search.mockReset();
  searchMocks.vectorSearch.mockReset();
  searchMocks.buildInferenceClient.mockReset();
  searchMocks.getVectorStoreClient.mockReset();
  searchMocks.getVectorStoreClient.mockResolvedValue({
    search: searchMocks.vectorSearch,
  });
});

function mockEmbeddingInfra() {
  const generateEmbeddingFromText = vi.fn(async () => ({
    embeddings: [[0.1, 0.2]],
    promptTokens: 1,
    totalTokens: 1,
  }));
  searchMocks.buildInferenceClient.mockReturnValue({
    generateEmbeddingFromText,
  });
  return generateEmbeddingFromText;
}

describe("bookmark search modes", () => {
  test<CustomTestContext>("defaults to full-text search", async ({
    apiCallers,
  }) => {
    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "full text result",
    });
    searchMocks.search.mockResolvedValue({
      hits: [{ id: bookmark.id, score: 1 }],
      totalHits: 1,
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.searchBookmarks({
      text: "result",
    });

    expect(result.bookmarks.map((item) => item.id)).toEqual([bookmark.id]);
    expect(searchMocks.vectorSearch).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("fuses full-text and semantic rankings", async ({
    apiCallers,
  }) => {
    const [ftsOnly, shared, semanticOnly] = await Promise.all(
      ["full text", "shared", "semantic"].map((text) =>
        apiCallers[0].bookmarks.createBookmark({
          type: BookmarkTypes.TEXT,
          text,
        }),
      ),
    );
    searchMocks.search.mockResolvedValue({
      hits: [
        { id: ftsOnly.id, score: 1 },
        { id: shared.id, score: 0.5 },
      ],
      totalHits: 2,
      processingTimeMs: 1,
    });
    searchMocks.vectorSearch.mockResolvedValue({
      hits: [
        { id: semanticOnly.id, score: 0.95 },
        { id: shared.id, score: 0.9 },
      ],
      processingTimeMs: 1,
    });
    const generateEmbeddingFromText = mockEmbeddingInfra();

    const result = await apiCallers[0].bookmarks.searchBookmarks({
      text: "meaningful query",
      searchMode: "hybrid",
    });

    expect(result.bookmarks[0]?.id).toBe(shared.id);
    expect(new Set(result.bookmarks.slice(1).map((item) => item.id))).toEqual(
      new Set([ftsOnly.id, semanticOnly.id]),
    );
    expect(generateEmbeddingFromText).toHaveBeenCalledWith([
      "meaningful query",
    ]);
    expect(searchMocks.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        vector: [0.1, 0.2],
        limit: 100,
        filter: [
          {
            type: "eq",
            field: "userId",
            value: expect.any(String),
          },
        ],
      }),
    );
    expect(searchMocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  test<CustomTestContext>("falls back to full-text search when hybrid infrastructure is unavailable", async ({
    apiCallers,
  }) => {
    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "fallback result",
    });
    searchMocks.buildInferenceClient.mockReturnValue(null);
    searchMocks.getVectorStoreClient.mockResolvedValue(null);
    searchMocks.search.mockResolvedValue({
      hits: [{ id: bookmark.id, score: 1 }],
      totalHits: 1,
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.searchBookmarks({
      text: "fallback",
      searchMode: "hybrid",
    });

    expect(result.bookmarks.map((item) => item.id)).toEqual([bookmark.id]);
    expect(searchMocks.vectorSearch).not.toHaveBeenCalled();
    expect(searchMocks.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  test<CustomTestContext>("falls back to full-text search for filter-only hybrid queries", async ({
    apiCallers,
  }) => {
    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "favourited bookmark",
      favourited: true,
    });
    mockEmbeddingInfra();
    searchMocks.search.mockResolvedValue({
      hits: [{ id: bookmark.id, score: 1 }],
      totalHits: 1,
      processingTimeMs: 1,
    });

    // A filter-only query has nothing to embed, so hybrid degrades to full-text
    // search, which also means date sorting is allowed again.
    const result = await apiCallers[0].bookmarks.searchBookmarks({
      text: "is:fav",
      searchMode: "hybrid",
      sortOrder: "desc",
    });

    expect(result.bookmarks.map((item) => item.id)).toEqual([bookmark.id]);
    expect(searchMocks.vectorSearch).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("rejects filter-only semantic queries", async ({
    apiCallers,
  }) => {
    mockEmbeddingInfra();

    await expect(
      apiCallers[0].bookmarks.searchBookmarks({
        text: "is:fav",
        searchMode: "semantic",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(searchMocks.vectorSearch).not.toHaveBeenCalled();
  });

  test<CustomTestContext>("rejects semantic search when its infrastructure is unavailable", async ({
    apiCallers,
  }) => {
    searchMocks.buildInferenceClient.mockReturnValue(null);
    searchMocks.getVectorStoreClient.mockResolvedValue(null);

    await expect(
      apiCallers[0].bookmarks.searchBookmarks({
        text: "semantic query",
        searchMode: "semantic",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test<CustomTestContext>("rejects date sorting for semantic and hybrid search", async ({
    apiCallers,
  }) => {
    mockEmbeddingInfra();

    await expect(
      apiCallers[0].bookmarks.searchBookmarks({
        text: "semantic query",
        searchMode: "hybrid",
        sortOrder: "desc",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test<CustomTestContext>("drops semantic hits below the similarity threshold", async ({
    apiCallers,
  }) => {
    const bookmark = await apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "semantic result",
    });
    mockEmbeddingInfra();
    searchMocks.vectorSearch.mockResolvedValue({
      hits: [{ id: bookmark.id, score: 0.9 }],
      processingTimeMs: 1,
    });

    const result = await apiCallers[0].bookmarks.searchBookmarks({
      text: "meaningful query",
      searchMode: "semantic",
    });

    expect(result.bookmarks.map((item) => item.id)).toEqual([bookmark.id]);
    expect(searchMocks.vectorSearch).toHaveBeenCalledWith(
      expect.objectContaining({ rankingScoreThreshold: 0.6 }),
    );
    expect(searchMocks.search).not.toHaveBeenCalled();
  });
});
