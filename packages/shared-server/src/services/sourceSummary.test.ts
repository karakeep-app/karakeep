import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  bookmarkLinks,
  bookmarks,
  summaryProcessing,
  users,
  webhooksTable,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { beginSummaryAttempt } from "./summaryState";
import {
  enqueueSourceSummary,
  executeSourceSummary,
  waitForSourceSummary,
} from "./sourceSummary";
import type { SummaryProviderInput } from "./summaryProviders";
import {
  generateSourceSummary,
  SummaryProviderError,
} from "./summaryProviders";
import {
  getSummaryProcessingStatus,
  requestSourceSummary,
} from "./summaryRecovery";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  enqueue: vi.fn(),
  index: vi.fn(),
  webhook: vi.fn(),
}));
vi.mock("../assetdb", () => ({
  readAsset: mocks.read,
  saveAsset: mocks.save,
  deleteAsset: mocks.remove,
  newAssetId: () => crypto.randomUUID(),
}));
vi.mock("../queues", () => ({
  OpenAIQueue: { enqueue: mocks.enqueue },
  triggerSearchReindex: mocks.index,
  WebhookQueue: { enqueue: mocks.webhook },
}));
vi.mock("@karakeep/shared/config", async (original) => {
  const actual = await original<typeof import("@karakeep/shared/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      summary: { ...actual.default.summary, provider: "notebooklm" },
      inference: { ...actual.default.inference, enableAutoSummarization: true },
    },
  };
});
let db: ReturnType<typeof getInMemoryDB>;
const text = "Full original content of the article. ".repeat(20);
const generate = () =>
  vi.fn(async (input: SummaryProviderInput) => {
    await input.onSource(text, "notebook");
    return { markdown: "# Generated", provider: "notebooklm" as const };
  });
beforeEach(() => {
  vi.clearAllMocks();
  db = getInMemoryDB(true);
  db.run(sql`PRAGMA foreign_keys = ON`);
  db.insert(users)
    .values({
      id: "owner",
      email: "owner@test.local",
      name: "Owner",
      autoSummarizationEnabled: true,
    })
    .run();
  db.insert(bookmarks)
    .values({ id: "link", userId: "owner", type: BookmarkTypes.LINK })
    .run();
  db.insert(bookmarkLinks)
    .values({
      id: "link",
      url: "https://example.com/article",
      htmlContent: `<p>${text}</p>`,
    })
    .run();
  mocks.read.mockResolvedValue({ asset: Buffer.from(text) });
  mocks.save.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
  mocks.index.mockResolvedValue(undefined);
  mocks.webhook.mockResolvedValue(undefined);
  mocks.enqueue.mockResolvedValue("queue-job");
  serverConfig.inference.enableAutoSummarization = true;
  serverConfig.summary.autoTagsEnabled = false;
});

describe("source summary lifecycle", () => {
  it("registers a generation before enqueue and reuses it on queue retry", async () => {
    await enqueueSourceSummary(db, "link", { groupId: "owner" });
    const job = mocks.enqueue.mock.calls[0][0];
    expect(job.summaryGeneration).toBe(
      db.select().from(summaryProcessing).get()?.generation,
    );
    const provider = generate();
    const opts = { automatic: true, generation: job.summaryGeneration };
    expect(
      await executeSourceSummary(db, "link", "owner", opts, provider),
    ).toEqual({ summary: "# Generated", published: true });
    expect(
      (await executeSourceSummary(db, "link", "owner", opts, provider))
        .published,
    ).toBe(false);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(mocks.index).toHaveBeenCalledTimes(1);
  });
  it("imports an article by URL and retains a separate fulltext asset", async () => {
    const original = db.select().from(bookmarkLinks).get();
    const provider = generate();
    await executeSourceSummary(db, "link", "owner", {}, provider);
    expect(provider.mock.calls[0][0].attempt.sourceUrl).toBe(original!.url);
    expect(provider.mock.calls[0][0].text).toContain("Full original content");
    expect(
      db.select().from(summaryProcessing).get()?.transcriptAssetId,
    ).toBeTruthy();
    expect(db.select().from(bookmarkLinks).get()).toEqual(original);
  });
  it("does not treat a YouTube web page body as a transcript", async () => {
    db.update(bookmarkLinks).set({ url: "https://youtu.be/abcdefghijk" }).run();
    const provider = generate();
    await executeSourceSummary(db, "link", "owner", {}, provider);
    expect(provider.mock.calls[0][0].text).toBeUndefined();
    expect(provider.mock.calls[0][0].attempt.sourceType).toBe("youtube");
  });
  it("preserves previous successful Markdown on failure", async () => {
    await executeSourceSummary(db, "link", "owner", {}, generate());
    const failed = vi
      .fn()
      .mockRejectedValue(new Error("private source and credentials"));
    await expect(
      executeSourceSummary(db, "link", "owner", {}, failed),
    ).rejects.toThrow("Summary generation failed: provider");
    expect(db.select().from(bookmarks).get()?.summary).toBe("# Generated");
    expect(db.select().from(summaryProcessing).get()?.status).toBe("pending");
    expect(db.select().from(summaryProcessing).get()?.stage).toBe("retry_wait");
  });
  it("does not invoke a provider for superseded queue work", async () => {
    const first = beginSummaryAttempt(db, "link", "owner", "article");
    beginSummaryAttempt(db, "link", "owner", "article");
    const provider = generate();
    expect(
      (
        await executeSourceSummary(
          db,
          "link",
          "owner",
          { generation: first.generation },
          provider,
        )
      ).published,
    ).toBe(false);
    expect(provider).not.toHaveBeenCalled();
  });
  it("fences a slow result after a newer manual request", async () => {
    let release!: (value: { markdown: string; provider: "notebooklm" }) => void;
    const slow = vi.fn(
      () =>
        new Promise<{ markdown: string; provider: "notebooklm" }>((resolve) => {
          release = resolve;
        }),
    );
    const running = executeSourceSummary(db, "link", "owner", {}, slow);
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    await executeSourceSummary(db, "link", "owner", {}, generate());
    release({ markdown: "Stale result", provider: "notebooklm" });
    expect((await running).published).toBe(false);
    expect(db.select().from(bookmarks).get()?.summary).toBe("# Generated");
    expect(mocks.index).toHaveBeenCalledTimes(1);
  });
  it("honors auto preferences and does not leave cancelled registered work pending", async () => {
    db.update(users).set({ autoSummarizationEnabled: false }).run();
    await enqueueSourceSummary(db, "link");
    expect(mocks.enqueue).not.toHaveBeenCalled();
    const attempt = beginSummaryAttempt(db, "link", "owner", "article");
    const provider = generate();
    await executeSourceSummary(
      db,
      "link",
      "owner",
      { automatic: true, generation: attempt.generation },
      provider,
    );
    expect(provider).not.toHaveBeenCalled();
    expect(db.select().from(bookmarks).get()?.summarizationStatus).toBe(
      "failure",
    );
  });
  it("checks ownership before contacting either provider", async () => {
    const provider = generate();
    await expect(
      executeSourceSummary(db, "link", "other", {}, provider),
    ).rejects.toThrow();
    expect(provider).not.toHaveBeenCalled();
  });
  it("notifies once after publication when a webhook is configured", async () => {
    db.insert(webhooksTable)
      .values({
        id: "hook",
        userId: "owner",
        url: "https://example.com/hook",
        events: ["edited"],
      })
      .run();
    await executeSourceSummary(db, "link", "owner", {}, generate());
    expect(mocks.webhook).toHaveBeenCalledWith(
      { bookmarkId: "link", userId: "owner", operation: "edited" },
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^summary:/),
      }),
    );
  });
  it("does not cancel eventual work when the manual HTTP wait expires", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    await expect(waitForSourceSummary(pending, 0.01)).rejects.toMatchObject({
      code: "timeout",
    });
    resolve("Completed later");
    expect(await pending).toBe("Completed later");
  });
  it("can import a URL after crawler failure and avoids duplicate post-crawl jobs", async () => {
    db.update(bookmarkLinks)
      .set({ crawlStatus: "failure", htmlContent: null })
      .run();
    await enqueueSourceSummary(db, "link", undefined, true);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    await enqueueSourceSummary(db, "link", undefined, true);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    const job = mocks.enqueue.mock.calls[0][0];
    const provider = generate();
    expect(
      (
        await executeSourceSummary(
          db,
          "link",
          "owner",
          { generation: job.summaryGeneration, automatic: true },
          provider,
        )
      ).published,
    ).toBe(true);
    expect(provider.mock.calls[0][0].text).toBeUndefined();
  });
  it("does not block URL import when a local content asset is missing", async () => {
    db.update(bookmarkLinks)
      .set({ htmlContent: null, contentAssetId: "missing-original" })
      .run();
    mocks.read.mockRejectedValue(new Error("unavailable"));
    const provider = generate();
    expect(
      (await executeSourceSummary(db, "link", "owner", {}, provider)).published,
    ).toBe(true);
    expect(provider.mock.calls[0][0].text).toBeUndefined();
  });
  it("cleans a newly saved source when its bookmark was concurrently deleted", async () => {
    mocks.save.mockImplementationOnce(async () => {
      db.delete(bookmarks).run();
    });
    await expect(
      executeSourceSummary(db, "link", "owner", {}, generate()),
    ).rejects.toThrow();
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(db.select().from(summaryProcessing).all()).toEqual([]);
  });
});

describe("summary recovery", () => {
  it("deduplicates queued manual runs and honors explicit runs with automatic summaries off", async () => {
    serverConfig.inference.enableAutoSummarization = false;
    await requestSourceSummary(db, "link", "owner");
    expect(await requestSourceSummary(db, "link", "owner")).toEqual({
      queued: false,
    });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    const job = mocks.enqueue.mock.calls[0][0];
    expect(job.summaryManual).toBe(true);
    await executeSourceSummary(
      db,
      "link",
      "owner",
      { generation: job.summaryGeneration, automatic: false },
      generate(),
    );
    expect(db.select().from(summaryProcessing).get()?.status).toBe("success");
  });
  it("uses two new generations with persistent 1 and 5 minute delayed jobs, then stops", async () => {
    const failing = vi
      .fn()
      .mockRejectedValue(new SummaryProviderError("timeout"));
    const first = beginSummaryAttempt(db, "link", "owner", "article");
    await expect(
      executeSourceSummary(
        db,
        "link",
        "owner",
        { generation: first.generation, automatic: true },
        failing,
      ),
    ).rejects.toThrow();
    const retry1 = db.select().from(summaryProcessing).get()!;
    expect(retry1).toMatchObject({
      stage: "retry_wait",
      status: "pending",
      retryCount: 1,
    });
    expect(retry1.generation).not.toBe(first.generation);
    expect(retry1.nextRetryAt!.getTime()).toBeGreaterThan(Date.now() + 55_000);
    expect(mocks.enqueue.mock.calls[0][1].delayMs).toBe(60_000);
    await executeSourceSummary(
      db,
      "link",
      "owner",
      { generation: first.generation, automatic: true },
      failing,
    );
    expect(failing).toHaveBeenCalledTimes(1);
    await expect(
      executeSourceSummary(
        db,
        "link",
        "owner",
        { generation: retry1.generation, automatic: true },
        failing,
      ),
    ).rejects.toThrow();
    const retry2 = db.select().from(summaryProcessing).get()!;
    expect(retry2.retryCount).toBe(2);
    expect(mocks.enqueue.mock.calls[1][1].delayMs).toBe(300_000);
    await expect(
      executeSourceSummary(
        db,
        "link",
        "owner",
        { generation: retry2.generation, automatic: true },
        failing,
      ),
    ).rejects.toThrow();
    expect(db.select().from(summaryProcessing).get()).toMatchObject({
      status: "failure",
      stage: "failure",
      retryCount: 2,
      nextRetryAt: null,
    });
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });
  it.each([
    "auth",
    "quota",
    "no_text",
    "too_large",
    "cancelled",
    "source_changed",
  ] as const)("does not automatically retry %s", async (code) => {
    await expect(
      executeSourceSummary(
        db,
        "link",
        "owner",
        {},
        vi.fn().mockRejectedValue(new SummaryProviderError(code)),
      ),
    ).rejects.toThrow();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(db.select().from(summaryProcessing).get()).toMatchObject({
      status: "failure",
      errorCode: code,
    });
  });
  it("allows an explicit retry to supersede scheduled recovery and resets its budget", async () => {
    await expect(
      executeSourceSummary(
        db,
        "link",
        "owner",
        {},
        vi.fn().mockRejectedValue(new SummaryProviderError("provider")),
      ),
    ).rejects.toThrow();
    const waiting = db.select().from(summaryProcessing).get()!;
    await requestSourceSummary(db, "link", "owner");
    const current = db.select().from(summaryProcessing).get()!;
    expect(current).toMatchObject({
      status: "pending",
      stage: "queued",
      retryCount: 0,
      nextRetryAt: null,
    });
    expect(current.generation).not.toBe(waiting.generation);
    const provider = generate();
    await executeSourceSummary(
      db,
      "link",
      "owner",
      { generation: waiting.generation, automatic: true },
      provider,
    );
    expect(provider).not.toHaveBeenCalled();
  });
  it("keeps progress/errors safe and fenced, and returns no source text or notebook ID", async () => {
    const run = async (input: SummaryProviderInput) => {
      await input.onProgress?.({ stage: "notebooklm" });
      expect(
        getSummaryProcessingStatus(db, "link", "owner").processing?.stage,
      ).toBe("notebooklm");
      await input.onProgress?.({ stage: "hermes", notebookErrorCode: "auth" });
      expect(
        getSummaryProcessingStatus(db, "link", "owner").processing,
      ).toMatchObject({ stage: "hermes", notebookErrorCode: "auth" });
      await input.onSource(text, "private-notebook");
      return { markdown: "# Summary", provider: "hermes" as const };
    };
    await executeSourceSummary(db, "link", "owner", {}, run);
    const result = getSummaryProcessingStatus(db, "link", "owner");
    expect(result.processing).toMatchObject({
      status: "success",
      provider: "hermes",
      notebookErrorCode: "auth",
    });
    expect(JSON.stringify(result)).not.toContain("private-notebook");
    expect(JSON.stringify(result)).not.toContain(text);
    expect(
      getSummaryProcessingStatus(db, "link", "other").processing,
    ).toBeNull();
  });
  it("fails visibly if enqueueing fails rather than leaving an orphan pending state", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("private queue error"));
    await expect(requestSourceSummary(db, "link", "owner")).rejects.toThrow(
      "Unable to queue",
    );
    expect(db.select().from(summaryProcessing).get()).toMatchObject({
      status: "failure",
      errorCode: "provider",
    });
  });
  it("rejects a late progress callback without modifying a newer attempt", async () => {
    const provider = async (input: SummaryProviderInput) => {
      beginSummaryAttempt(db, "link", "owner", "article");
      await input.onProgress?.({ stage: "hermes", notebookErrorCode: "auth" });
      return { markdown: "# stale", provider: "hermes" as const };
    };
    await expect(
      executeSourceSummary(db, "link", "owner", {}, provider),
    ).rejects.toThrow();
    expect(db.select().from(summaryProcessing).get()).toMatchObject({
      status: "pending",
      stage: "queued",
      notebookErrorCode: null,
    });
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});

it("schedules recovery for a temporary YouTube import failure before any transcript was obtained", async () => {
  db.update(bookmarkLinks)
    .set({ url: "https://youtube.com/watch?v=abcdefghijk", htmlContent: null })
    .run();
  const hermes = vi.fn();
  const generator = (input: SummaryProviderInput) =>
    generateSourceSummary(input, {
      notebook: vi.fn().mockRejectedValue(new SummaryProviderError("timeout")),
      hermes,
    });
  await expect(
    executeSourceSummary(db, "link", "owner", {}, generator),
  ).rejects.toMatchObject({ code: "timeout" });
  expect(hermes).not.toHaveBeenCalled();
  expect(db.select().from(summaryProcessing).get()).toMatchObject({
    sourceType: "youtube",
    status: "pending",
    stage: "retry_wait",
    retryCount: 1,
    notebookErrorCode: "timeout",
    transcriptAssetId: null,
  });
});

it("publishes the summary before queueing independent tags and tolerates queue failure", async () => {
  serverConfig.summary.autoTagsEnabled = true;
  mocks.enqueue.mockImplementationOnce(async (payload) => {
    expect(payload.type).toBe("summary_tags");
    expect(db.select().from(bookmarks).get()).toMatchObject({
      summary: "# Generated",
      summarizationStatus: "success",
      taggingStatus: "pending",
    });
    throw new Error("private queue failure");
  });
  expect(
    await executeSourceSummary(db, "link", "owner", {}, generate()),
  ).toMatchObject({ published: true, summary: "# Generated" });
  expect(db.select().from(summaryProcessing).get()).toMatchObject({
    status: "success",
    taggingStatus: "failure",
    taggingErrorCode: "provider",
  });
  expect(db.select().from(bookmarks).get()?.summary).toBe("# Generated");
});
