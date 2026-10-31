import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ZEmbeddingsRequest } from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { bookmarkTexts, bookmarks, users } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { runEmbeddings } from "./embeddingsWorker";

const mocks = await vi.hoisted(async () => {
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return {
    db: getInMemoryDB(true),
    embeddingsEnqueue: vi.fn(),
    openAIEnqueue: vi.fn(),
    buildEmbeddingClient: vi.fn(),
    getVectorStoreClient: vi.fn(),
    loggerWarn: vi.fn(),
    loggerDebug: vi.fn(),
  };
});

vi.mock("@karakeep/db", async (original) => ({
  ...(await original<typeof import("@karakeep/db")>()),
  db: mocks.db,
}));

vi.mock("@karakeep/shared-server", async (original) => ({
  ...(await original<typeof import("@karakeep/shared-server")>()),
  EmbeddingsQueue: { enqueue: mocks.embeddingsEnqueue },
  OpenAIQueue: { enqueue: mocks.openAIEnqueue },
}));

vi.mock("@karakeep/shared/inference", () => ({
  EmbeddingClientFactory: { build: mocks.buildEmbeddingClient },
}));

vi.mock("@karakeep/shared/vectorStore", () => ({
  getVectorStoreClient: mocks.getVectorStoreClient,
}));

vi.mock("@karakeep/shared/logger", () => ({
  default: {
    info: vi.fn(),
    warn: mocks.loggerWarn,
    debug: mocks.loggerDebug,
    error: vi.fn(),
  },
}));

const db = mocks.db;

function buildJob(
  data: ZEmbeddingsRequest,
  priority = 0,
): DequeuedJob<ZEmbeddingsRequest> {
  return {
    id: "job",
    data,
    priority,
    runNumber: 0,
    abortSignal: new AbortController().signal,
  };
}

async function createBookmarkWithText(text: string) {
  const [user] = await db
    .insert(users)
    .values({
      name: "Test",
      email: `${crypto.randomUUID()}@test.com`,
    })
    .returning();
  const [bookmark] = await db
    .insert(bookmarks)
    .values({
      userId: user.id,
      type: BookmarkTypes.TEXT,
      title: "A bookmark",
    })
    .returning();
  await db.insert(bookmarkTexts).values({ id: bookmark.id, text });
  return { user, bookmark };
}

describe("runEmbeddings: embed with no embedding client configured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A configured vector store, so the run reaches the embedding-client check
    // instead of returning early for a different reason.
    mocks.getVectorStoreClient.mockResolvedValue({
      addVectors: vi.fn(),
      deleteVectors: vi.fn(),
    });
    mocks.buildEmbeddingClient.mockReturnValue(null);
  });

  test("logs a warning, not a debug message, and still enqueues tagging", async () => {
    const { user, bookmark } = await createBookmarkWithText(
      "some bookmark content",
    );
    const job = buildJob({
      type: "embed",
      bookmarkId: bookmark.id,
      // Bypass the (unrelated) auto-indexing-disabled early return so this
      // test exercises the "no embedding client configured" path directly.
      force: true,
      runTaggingOnComplete: true,
    });

    await runEmbeddings(job);

    // Regression for https://github.com/karakeep-app/karakeep/issues/3146:
    // this is a misconfiguration, so it must be visible at the default
    // ("warning") log level, not only with LOG_LEVEL=debug.
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("No embedding client configured"),
    );
    expect(mocks.loggerDebug).not.toHaveBeenCalledWith(
      expect.stringContaining("No embedding client configured"),
    );

    // The bookmark should still get tagged (without a similarity context)
    // even though no embedding was generated.
    expect(mocks.openAIEnqueue).toHaveBeenCalledWith(
      { bookmarkId: bookmark.id, type: "tag" },
      { priority: job.priority, groupId: user.id },
    );
    expect(mocks.embeddingsEnqueue).not.toHaveBeenCalled();
  });

  test("never calls the embedding client when none is configured", async () => {
    const { bookmark } = await createBookmarkWithText("more content");
    const job = buildJob({
      type: "embed",
      bookmarkId: bookmark.id,
      force: true,
      runTaggingOnComplete: false,
    });

    await runEmbeddings(job);

    expect(mocks.buildEmbeddingClient).toHaveBeenCalledTimes(1);
    expect(mocks.openAIEnqueue).not.toHaveBeenCalled();
    expect(mocks.embeddingsEnqueue).not.toHaveBeenCalled();
  });
});
