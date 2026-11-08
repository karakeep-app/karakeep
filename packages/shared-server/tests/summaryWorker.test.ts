import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runner: vi.fn(),
  summary: vi.fn(),
  update: vi.fn(),
  legacy: vi.fn(),
  find: vi.fn(),
  tags: vi.fn(),
}));
vi.mock("@karakeep/db", async (original) => {
  const actual = await original<typeof import("@karakeep/db")>();
  return {
    ...actual,
    db: {
      query: { bookmarks: { findFirst: mocks.find } },
      update: mocks.update,
    },
  };
});
vi.mock("@karakeep/shared/queueing", async (original) => {
  const actual = await original<typeof import("@karakeep/shared/queueing")>();
  return {
    ...actual,
    getQueueClient: async () => ({ createRunner: mocks.runner }),
  };
});
vi.mock("@karakeep/shared/inference", async (original) => {
  const actual = await original<typeof import("@karakeep/shared/inference")>();
  return { ...actual, InferenceClientFactory: { build: mocks.legacy } };
});
vi.mock("@karakeep/shared/config", async (original) => {
  const actual = await original<typeof import("@karakeep/shared/config")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      summary: { ...actual.default.summary, provider: "notebooklm" },
    },
  };
});
vi.mock("../../../apps/workers/workers/inference/summarize", () => ({
  runSummarization: mocks.summary,
}));
vi.mock("../src/services/summaryTags", async (original) => ({
  ...(await original<typeof import("../src/services/summaryTags")>()),
  tagPublishedSummary: mocks.tags,
}));
vi.mock("../../../apps/workers/workerTracing", () => ({
  withWorkerTracing: (_name: unknown, fn: unknown) => fn,
  withWorkerEventLog: (_name: unknown, fn: unknown) => fn,
}));

import { OpenAiWorker } from "../../../apps/workers/workers/inference/inferenceWorker";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.legacy.mockReturnValue(null);
  mocks.find.mockResolvedValue({ userId: "owner" });
  mocks.summary.mockResolvedValue(undefined);
});
describe("NotebookLM queue integration", () => {
  it("runs summary tags through the dedicated client and ignores stale generic callbacks", async () => {
    await OpenAiWorker.build();
    const callbacks = mocks.runner.mock.calls[0][1];
    const job = {
      id: "tags",
      data: {
        bookmarkId: "link",
        type: "summary_tags",
        summaryGeneration: "d3caa4e4-ef15-43e3-9bd0-d4caa7771ac1",
      },
      priority: 0,
      runNumber: 0,
      abortSignal: new AbortController().signal,
    };
    await callbacks.run(job);
    expect(mocks.tags).toHaveBeenCalledWith(
      expect.anything(),
      "link",
      "owner",
      job.data.summaryGeneration,
      job.abortSignal,
    );
    expect(mocks.legacy).not.toHaveBeenCalled();
    await callbacks.onComplete(job);
    await callbacks.onError({
      ...job,
      error: new Error("safe"),
      numRetriesLeft: 0,
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("runs a summary with no legacy inference client", async () => {
    await OpenAiWorker.build();
    const callbacks = mocks.runner.mock.calls[0][1];
    const job = {
      id: "job",
      data: { bookmarkId: "link", type: "summarize" },
      priority: 0,
      runNumber: 0,
      abortSignal: new AbortController().signal,
    };
    await callbacks.run(job);
    expect(mocks.summary).toHaveBeenCalledWith("link", job, null);
  });
  it("does not let queue completion or error callbacks overwrite generation-fenced status", async () => {
    await OpenAiWorker.build();
    const callbacks = mocks.runner.mock.calls[0][1];
    const job = {
      id: "old-job",
      data: { bookmarkId: "link", type: "summarize" },
      error: new Error("expired"),
      numRetriesLeft: 0,
    };
    await callbacks.onComplete(job);
    await callbacks.onError(job);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("gives the runner enough time for the total summary budget", async () => {
    await OpenAiWorker.build();
    expect(mocks.runner.mock.calls[0][2].timeoutSecs).toBeGreaterThanOrEqual(
      615,
    );
  });
});
