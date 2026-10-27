import { beforeEach, describe, expect, test, vi } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";

vi.mock("metrics", () => ({
  workerStatsCounter: {
    labels: () => ({ inc: vi.fn() }),
  },
}));

vi.mock("workerTracing", () => ({
  withWorkerEventLog: () => (fn: unknown) => fn,
  withWorkerTracing: () => (fn: unknown) => fn,
}));

const dbMock = vi.hoisted(() => ({
  query: {
    bookmarks: {
      findFirst: vi.fn(),
    },
  },
  update: vi.fn(),
}));

const queueMock = vi.hoisted(() => ({
  embeddingsEnqueue: vi.fn(),
  openaiEnqueue: vi.fn(),
}));

const vectorStoreMock = vi.hoisted(() => ({
  addVectors: vi.fn(),
  deleteVectors: vi.fn(),
}));

// Mutable holder so tests can make the vector store unavailable.
const vectorStoreHolder = vi.hoisted(() => ({
  client: null as {
    addVectors: () => Promise<void>;
    deleteVectors: () => Promise<void>;
  } | null,
}));

vi.mock("@karakeep/db", () => ({
  db: dbMock,
}));

vi.mock("@karakeep/db/schema", () => ({
  bookmarks: { id: "id", embeddingStatus: "embeddingStatus" },
}));

vi.mock("@karakeep/shared/queueing", () => ({
  getQueueClient: vi.fn(async () => ({
    createQueue: (name: string) => ({
      name: () => name,
      opts: {},
      ensureInit: async () => undefined,
      enqueue:
        name === "embeddings_queue"
          ? queueMock.embeddingsEnqueue
          : queueMock.openaiEnqueue,
      stats: async () => ({
        pending: 0,
        pending_retry: 0,
        running: 0,
        failed: 0,
      }),
    }),
  })),
  QueueRetryAfterError: class extends Error {
    name = "QueueRetryAfterError";
  },
}));

vi.mock("@karakeep/shared/inference", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/inference")>()),
  EmbeddingClientFactory: {
    build: vi.fn(),
  },
}));

vi.mock("@karakeep/shared/vectorStore", async (original) => ({
  ...(await original<typeof import("@karakeep/shared/vectorStore")>()),
  getVectorStoreClient: vi.fn(async () => vectorStoreHolder.client),
}));

vi.mock("@karakeep/trpc/models/bookmarks", async (original) => ({
  ...(await original<typeof import("@karakeep/trpc/models/bookmarks")>()),
  Bookmark: {
    getBookmarkPlainTextContent: vi.fn(),
  },
}));

import { EmbeddingClientFactory } from "@karakeep/shared/inference";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";
import type { EmbeddableBookmark } from "./workers/embeddingsWorker";
import {
  buildEmbeddingTexts,
  buildSimilarEmbeddingText,
  embeddingStatusUpdate,
  runEmbeddings,
} from "./workers/embeddingsWorker";

function embeddableBookmark(
  overrides: Partial<EmbeddableBookmark>,
): EmbeddableBookmark {
  return {
    id: "bookmark-1",
    userId: "user-1",
    title: null,
    summary: null,
    link: null,
    text: null,
    asset: null,
    ...overrides,
  } as unknown as EmbeddableBookmark;
}

describe("buildSimilarEmbeddingText", () => {
  test("uses Title + Summary once a summary exists", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        title: "Async Rust",
        summary: "  Futures, pinning\n\nand executors explained.  ",
        text: { text: "raw content should be ignored" } as never,
      }),
    );

    expect(text).toBe(
      "Title: Async Rust\n\nSummary: Futures, pinning and executors explained.",
    );
  });

  test("uses only the summary when the title is missing", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        summary: "A short summary.",
      }),
    );

    expect(text).toBe("Summary: A short summary.");
  });

  test("uses the crawled page title when no user title is set", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        summary: "Summary text.",
        link: { title: "Crawled Page Title" } as never,
      }),
    );

    expect(text).toBe("Title: Crawled Page Title\n\nSummary: Summary text.");
  });

  test("falls back to the crawled content for links without a summary", async () => {
    vi.mocked(Bookmark.getBookmarkPlainTextContent).mockResolvedValue(
      "Hello world" as never,
    );
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        title: "Link",
        link: {
          contentAssetId: null,
          htmlContent: "<p>Hello world</p>",
        } as never,
      }),
    );

    expect(text).toBe("Title: Link\n\nContent excerpt: Hello world");
  });

  test("falls back to Title + Content excerpt without a summary", async () => {
    const text = await buildSimilarEmbeddingText(
      embeddableBookmark({
        title: "My note",
        text: { text: "  Some\n\nnote   content " } as never,
      }),
    );

    expect(text).toBe("Title: My note\n\nContent excerpt: Some note content");
  });

  test("returns null when there is nothing to embed", async () => {
    const text = await buildSimilarEmbeddingText(embeddableBookmark({}));

    expect(text).toBeNull();
  });
});

describe("buildEmbeddingTexts", () => {
  test("the search profile is richer than the similar-articles text", async () => {
    vi.mocked(Bookmark.getBookmarkPlainTextContent).mockResolvedValue(
      "Some article body" as never,
    );
    const texts = await buildEmbeddingTexts(
      embeddableBookmark({
        type: BookmarkTypes.LINK,
        title: "Async Rust",
        summary: "Futures explained.",
        link: {
          contentAssetId: null,
          htmlContent: "<p>Some article body</p>",
          url: "https://example.com/rust?page=1",
          author: "Jane Doe",
        } as never,
        tagsOnBookmarks: [
          { tag: { name: "rust" } },
          { tag: { name: "async" } },
        ] as never,
      }),
    );

    // Lean similar-articles text: only title + summary.
    expect(texts.similar).toBe(
      "Title: Async Rust\n\nSummary: Futures explained.",
    );
    // Rich search profile: tags, domain, description, author, content.
    expect(texts.search).toContain("Type: link");
    expect(texts.search).toContain("Tags: async, rust");
    expect(texts.search).toContain("Domain: example.com");
    expect(texts.search).toContain("Author: Jane Doe");
    expect(texts.search).toContain("Content excerpt: Some article body");
    // The URL is stripped of query params and not part of the lean text.
    expect(texts.search).toContain("https://example.com/rust");
    expect(texts.similar).not.toContain("example.com");
  });
});

describe("embeddingStatusUpdate", () => {
  const indexJob = {
    type: "index" as const,
    bookmarkId: "b",
    userId: "u",
    embedding: [1],
  };
  const embedJob = {
    type: "embed" as const,
    bookmarkId: "b",
    runTaggingOnComplete: true,
  };
  const deleteJob = { type: "delete" as const, bookmarkId: "b" };

  test("only index jobs confirm success", () => {
    expect(embeddingStatusUpdate(indexJob, "success")).toEqual({
      value: "success",
      onlyWhenPending: false,
    });
    expect(embeddingStatusUpdate(embedJob, "success")).toBeNull();
    expect(embeddingStatusUpdate(deleteJob, "success")).toBeNull();
  });

  test("failures only apply to still-pending bookmarks", () => {
    expect(embeddingStatusUpdate(embedJob, "failure")).toEqual({
      value: "failure",
      onlyWhenPending: true,
    });
    expect(embeddingStatusUpdate(indexJob, "failure")).toEqual({
      value: "failure",
      onlyWhenPending: true,
    });
    expect(embeddingStatusUpdate(deleteJob, "failure")).toBeNull();
  });
});

describe("runEmbeddings", () => {
  const embeddingClient = { generateEmbeddingFromText: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vectorStoreHolder.client = {
      addVectors: vectorStoreMock.addVectors,
      deleteVectors: vectorStoreMock.deleteVectors,
    };
    embeddingClient.generateEmbeddingFromText.mockResolvedValue({
      embeddings: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
      promptTokens: 2,
      totalTokens: 5,
    });
    vi.mocked(EmbeddingClientFactory.build).mockReturnValue(
      embeddingClient as never,
    );
    dbMock.query.bookmarks.findFirst.mockResolvedValue({
      id: "bookmark-1",
      userId: "user-1",
      type: BookmarkTypes.TEXT,
      title: "A note",
      summary: null,
      link: null,
      text: { text: "note content" },
      asset: null,
      tagsOnBookmarks: [],
    });
    vi.mocked(Bookmark.getBookmarkPlainTextContent).mockResolvedValue(
      "unused" as never,
    );
  });

  function embeddingsJob(
    data: ZEmbeddingsRequest,
  ): DequeuedJob<ZEmbeddingsRequest> {
    return {
      id: "job-1",
      data,
      priority: 0,
      runNumber: 1,
      abortSignal: new AbortController().signal,
    } as DequeuedJob<ZEmbeddingsRequest>;
  }

  test("embed success dispatches an index job and a tag job with the search vector", async () => {
    // Auto-indexing is disabled in the test env, so the job must be forced.
    await runEmbeddings(
      embeddingsJob({
        type: "embed",
        bookmarkId: "bookmark-1",
        force: true,
        runTaggingOnComplete: true,
      }),
    );

    expect(queueMock.embeddingsEnqueue).toHaveBeenCalledTimes(1);
    const indexPayload = queueMock.embeddingsEnqueue.mock.calls[0]![0]!;
    expect(indexPayload.type).toBe("index");
    expect(indexPayload.userId).toBe("user-1");
    expect(indexPayload.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(indexPayload.similarEmbedding).toEqual([0.4, 0.5, 0.6]);
    expect(indexPayload.fingerprints.search).toMatch(/^[0-9a-f]{64}$/);
    expect(indexPayload.fingerprints.similar).toMatch(/^[0-9a-f]{64}$/);

    expect(queueMock.openaiEnqueue).toHaveBeenCalledTimes(1);
    const tagPayload = queueMock.openaiEnqueue.mock.calls[0]![0]!;
    expect(tagPayload).toEqual({
      bookmarkId: "bookmark-1",
      type: "tag",
      embedding: [0.1, 0.2, 0.3],
    });

    // The embed run itself never writes vectors.
    expect(vectorStoreMock.addVectors).not.toHaveBeenCalled();
  });

  test("embedding refreshes don't re-run tagging", async () => {
    await runEmbeddings(
      embeddingsJob({
        type: "embed",
        bookmarkId: "bookmark-1",
        force: true,
        runTaggingOnComplete: false,
      }),
    );

    expect(queueMock.embeddingsEnqueue).toHaveBeenCalledTimes(1);
    expect(queueMock.openaiEnqueue).not.toHaveBeenCalled();
  });

  test("without a vector store only tagging is enqueued", async () => {
    vectorStoreHolder.client = null;

    await runEmbeddings(
      embeddingsJob({
        type: "embed",
        bookmarkId: "bookmark-1",
        runTaggingOnComplete: true,
      }),
    );

    expect(queueMock.openaiEnqueue).toHaveBeenCalledTimes(1);
    expect(
      queueMock.openaiEnqueue.mock.calls[0]![0]!.embedding,
    ).toBeUndefined();
    expect(embeddingClient.generateEmbeddingFromText).not.toHaveBeenCalled();
  });

  test("without an embedding client only tagging is enqueued", async () => {
    vi.mocked(EmbeddingClientFactory.build).mockReturnValue(null as never);

    await runEmbeddings(
      embeddingsJob({
        type: "embed",
        bookmarkId: "bookmark-1",
        force: true,
        runTaggingOnComplete: true,
      }),
    );

    expect(queueMock.openaiEnqueue).toHaveBeenCalledTimes(1);
    expect(
      queueMock.openaiEnqueue.mock.calls[0]![0]!.embedding,
    ).toBeUndefined();
  });

  test("without auto-indexing and force only tagging is enqueued", async () => {
    await runEmbeddings(
      embeddingsJob({
        type: "embed",
        bookmarkId: "bookmark-1",
        runTaggingOnComplete: true,
      }),
    );

    expect(queueMock.openaiEnqueue).toHaveBeenCalledTimes(1);
    expect(embeddingClient.generateEmbeddingFromText).not.toHaveBeenCalled();
  });

  test("index dispatch persists both vectors when the texts still match", async () => {
    const { createHash } = await import("node:crypto");
    const sha256 = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    // Text bookmark with title + content → predictable texts.
    // similar: "Title: A note\n\nContent excerpt: note content"
    // search: "Title: A note\n\nType: text\n\nContent excerpt: note content"

    await runEmbeddings(
      embeddingsJob({
        type: "index",
        bookmarkId: "bookmark-1",
        userId: "user-1",
        embedding: [0.1],
        similarEmbedding: [0.4],
        fingerprints: {
          search: sha256(
            "Title: A note\n\nType: text\n\nContent excerpt: note content",
          ),
          similar: sha256("Title: A note\n\nContent excerpt: note content"),
        },
      }),
    );

    expect(vectorStoreMock.addVectors).toHaveBeenCalledWith([
      {
        id: "bookmark-1",
        userId: "user-1",
        vectors: { search: [0.1], similar: [0.4] },
      },
    ]);
    expect(queueMock.embeddingsEnqueue).not.toHaveBeenCalled();
  });

  test("index dispatch skips stale vectors and re-enqueues an embed", async () => {
    await runEmbeddings(
      embeddingsJob({
        type: "index",
        bookmarkId: "bookmark-1",
        userId: "user-1",
        embedding: [0.1],
        fingerprints: { search: "no-longer-current" },
      }),
    );

    expect(vectorStoreMock.addVectors).not.toHaveBeenCalled();
    expect(queueMock.embeddingsEnqueue).toHaveBeenCalledTimes(1);
    const refreshPayload = queueMock.embeddingsEnqueue.mock.calls[0]![0]!;
    expect(refreshPayload).toEqual({
      bookmarkId: "bookmark-1",
      type: "embed",
      runTaggingOnComplete: false,
    });
    // The refresh coalesces on a bookmark-derived idempotency key.
    expect(queueMock.embeddingsEnqueue.mock.calls[0]![1]!.idempotencyKey).toBe(
      "embed-refresh:bookmark-1",
    );
  });

  test("index dispatch skips bookmarks that were deleted in the meantime", async () => {
    dbMock.query.bookmarks.findFirst.mockResolvedValue(null);

    await runEmbeddings(
      embeddingsJob({
        type: "index",
        bookmarkId: "bookmark-1",
        userId: "user-1",
        embedding: [0.1],
      }),
    );

    expect(vectorStoreMock.addVectors).not.toHaveBeenCalled();
    expect(queueMock.embeddingsEnqueue).not.toHaveBeenCalled();
  });

  test("delete dispatch deletes the vector", async () => {
    await runEmbeddings(
      embeddingsJob({ type: "delete", bookmarkId: "bookmark-1" }),
    );

    expect(vectorStoreMock.deleteVectors).toHaveBeenCalledWith(["bookmark-1"]);
  });
});
