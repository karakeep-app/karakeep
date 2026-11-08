import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { summaryProcessing } from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { defaultBeforeEach, getApiKeyCallerForPlainKey } from "../testUtils";
import type { CustomTestContext } from "../testUtils";

const queue = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("../../shared-server/src/queues", async (original) => ({
  ...(await original<typeof import("../../shared-server/src/queues")>()),
  OpenAIQueue: { enqueue: queue.enqueue },
}));
const originalProvider = serverConfig.summary.provider;
beforeEach<CustomTestContext>(defaultBeforeEach(true));
beforeEach(() => {
  serverConfig.summary.provider = "notebooklm";
  queue.enqueue.mockReset();
});
afterEach(() => {
  serverConfig.summary.provider = originalProvider;
});

describe("summary processing endpoints", () => {
  test<CustomTestContext>("only the owner can read diagnostics or enqueue a retry", async ({
    apiCallers,
    unauthedAPICaller,
  }) => {
    const b = await apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/summary-access",
    });
    await expect(
      apiCallers[1].bookmarks.getSummaryProcessing({ bookmarkId: b.id }),
    ).rejects.toThrow();
    await expect(
      apiCallers[1].bookmarks.retrySummary({ bookmarkId: b.id }),
    ).rejects.toThrow();
    await expect(
      unauthedAPICaller.bookmarks.getSummaryProcessing({ bookmarkId: b.id }),
    ).rejects.toThrow();
    expect(
      await apiCallers[0].bookmarks.getSummaryProcessing({ bookmarkId: b.id }),
    ).toEqual({ enabled: true, processing: null });
  });
  test<CustomTestContext>("returns promptly, queues once and exposes only safe status fields", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0].bookmarks;
    const b = await api.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com/summary-queue",
    });
    expect(await api.retrySummary({ bookmarkId: b.id })).toEqual({
      queued: true,
    });
    expect(await api.retrySummary({ bookmarkId: b.id })).toEqual({
      queued: false,
    });
    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(queue.enqueue.mock.calls[0][0]).toMatchObject({
      summaryManual: true,
      bookmarkId: b.id,
    });
    db.update(summaryProcessing)
      .set({
        notebookId: "private-id",
        notebookErrorCode: "auth",
        stage: "hermes",
      })
      .where(eq(summaryProcessing.bookmarkId, b.id))
      .run();
    const s = await api.getSummaryProcessing({ bookmarkId: b.id });
    expect(s.processing).toMatchObject({
      stage: "hermes",
      notebookErrorCode: "auth",
    });
    expect(JSON.stringify(s)).not.toContain("private-id");
    expect(JSON.stringify(s)).not.toContain("generation");
    expect(JSON.stringify(s)).not.toContain("transcriptAssetId");
  });
  test<CustomTestContext>("rejects disabled pipelines and non-link bookmarks", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].bookmarks;
    const note = await api.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "Note",
    });
    await expect(api.retrySummary({ bookmarkId: note.id })).rejects.toThrow(
      "Only link",
    );
    serverConfig.summary.provider = "legacy";
    expect(
      (await api.getSummaryProcessing({ bookmarkId: note.id })).enabled,
    ).toBe(false);
    await expect(api.retrySummary({ bookmarkId: note.id })).rejects.toThrow(
      "disabled",
    );
  });
});

test<CustomTestContext>("read-only API keys cannot enqueue summary work", async ({
  apiCallers,
  db,
}) => {
  const b = await apiCallers[0].bookmarks.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://example.com/summary-scope",
  });
  const key = await apiCallers[0].apiKeys.create({
    name: "summary read only",
    scopes: ["bookmarks:read"],
  });
  const caller = await getApiKeyCallerForPlainKey(db, key.key);
  expect(
    (await caller.bookmarks.getSummaryProcessing({ bookmarkId: b.id })).enabled,
  ).toBe(true);
  await expect(
    caller.bookmarks.retrySummary({ bookmarkId: b.id }),
  ).rejects.toThrow();
  expect(queue.enqueue).not.toHaveBeenCalled();
});
