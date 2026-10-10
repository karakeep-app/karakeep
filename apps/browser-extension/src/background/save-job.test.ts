import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  upload: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  attach: vi.fn(),
  replace: vi.fn(),
  recrawl: vi.fn(),
  settings: vi.fn(),
  clearBadge: vi.fn(),
}));
vi.mock("../utils/singlefile", () => ({
  capturePageWithSingleFile: mocks.capture,
  uploadSingleFileAsset: mocks.upload,
  withTimeout: <T>(promise: Promise<T>) => promise,
}));
vi.mock("../utils/settings", () => ({ getPluginSettings: mocks.settings }));
vi.mock("../utils/badgeCache", () => ({ clearBadgeStatus: mocks.clearBadge }));
vi.mock("../utils/trpc", () => ({
  createApiClient: () => ({
    bookmarks: {
      createBookmark: { mutate: mocks.create },
      getBookmark: { query: mocks.get },
      recrawlBookmark: { mutate: mocks.recrawl },
    },
    assets: {
      attachAsset: { mutate: mocks.attach },
      replaceAsset: { mutate: mocks.replace },
    },
  }),
}));

import { handleSaveMessage, runSaveJob } from "./save-job";
import type { SaveJob } from "./save-protocol";
import { saveJobKey } from "./save-protocol";
import type { Settings } from "../utils/settings";

const settings: Settings = {
  address: "https://karakeep.test",
  apiKey: "test-key",
  theme: "system",
  showCountBadge: false,
  useBadgeCache: false,
  badgeCacheExpireMs: 1000,
  customHeaders: {},
  useSingleFile: true,
  singleFileIncludeImages: true,
  autoSave: true,
};
const makeJob = (): SaveJob => ({
  id: "job",
  tabId: 1,
  tabUrl: "https://signed-in.test/article",
  connectionId: "connection",
  bookmark: {
    type: BookmarkTypes.LINK,
    url: "https://signed-in.test/article",
    title: "Private article",
    note: "My note",
    source: "extension",
  },
  capture: true,
  stage: "capturing",
});
let storage: Record<string, SaveJob>;

beforeEach(() => {
  vi.resetAllMocks();
  storage = {};
  vi.stubGlobal("chrome", {
    storage: {
      session: {
        get: vi.fn(async (key: string) => ({
          [key]: structuredClone(storage[key]),
        })),
        set: vi.fn(async (data: Record<string, SaveJob>) => {
          Object.assign(storage, structuredClone(data));
        }),
        remove: vi.fn(async (key: string) => {
          delete storage[key];
        }),
      },
    },
    runtime: { getPlatformInfo: vi.fn().mockResolvedValue({}) },
  });
  mocks.settings.mockResolvedValue(settings);
  mocks.capture.mockResolvedValue(
    "<html><body>Signed-in content</body></html>",
  );
  mocks.upload.mockResolvedValue("snapshot");
  mocks.create.mockResolvedValue({ id: "bookmark", alreadyExists: false });
  mocks.get.mockResolvedValue({
    assets: [{ id: "snapshot", assetType: "precrawledArchive" }],
  });
  mocks.attach.mockResolvedValue({});
  mocks.replace.mockResolvedValue(undefined);
  mocks.recrawl.mockResolvedValue(undefined);
  mocks.clearBadge.mockResolvedValue(undefined);
});

describe("saving the open page", () => {
  it("captures the source tab, uploads signed-in HTML, and preserves bookmark fields", async () => {
    const job = makeJob();
    await runSaveJob(job, settings);
    expect(mocks.capture).toHaveBeenCalledWith(1, {
      expectedUrl: job.tabUrl,
      includeImages: true,
    });
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringContaining("Signed-in content"),
      settings,
      "Private article",
    );
    expect(mocks.create).toHaveBeenCalledWith({
      ...job.bookmark,
      clientRequestId: job.id,
      precrawledArchiveId: "snapshot",
    });
    expect(mocks.attach).not.toHaveBeenCalled();
    expect(storage[saveJobKey(1)]).toMatchObject({
      stage: "saved",
      bookmarkId: "bookmark",
    });
  });

  it.each(["capture", "upload"] as const)(
    "does not save a URL-only bookmark when %s fails",
    async (step) => {
      mocks[step].mockRejectedValue(new Error("Access denied"));
      await runSaveJob(makeJob(), settings);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(storage[saveJobKey(1)]).toMatchObject({
        stage: "failed",
        error: "Access denied",
      });
    },
  );

  it("attaches a snapshot to an existing URL that has no browser archive", async () => {
    mocks.create.mockResolvedValue({ id: "existing", alreadyExists: true });
    mocks.get.mockResolvedValue({ assets: [] });
    await runSaveJob(makeJob(), settings);
    expect(mocks.attach).toHaveBeenCalledWith({
      bookmarkId: "existing",
      asset: { id: "snapshot", assetType: "precrawledArchive" },
    });
    expect(mocks.recrawl).toHaveBeenCalledWith({ bookmarkId: "existing" });
  });

  it("replaces an existing browser snapshot before queuing processing", async () => {
    mocks.get.mockResolvedValue({
      assets: [{ id: "old", assetType: "precrawledArchive" }],
    });
    await runSaveJob(makeJob(), settings);
    expect(mocks.replace).toHaveBeenCalledWith({
      bookmarkId: "bookmark",
      oldAssetId: "old",
      newAssetId: "snapshot",
    });
    expect(mocks.replace.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.recrawl.mock.invocationCallOrder[0],
    );
  });

  it("retries processing without capturing, uploading, or replacing a second time", async () => {
    const job = makeJob();
    mocks.create.mockResolvedValue({ id: "bookmark", alreadyExists: true });
    mocks.recrawl.mockRejectedValueOnce(new Error("Offline"));
    await runSaveJob(job, settings);
    expect(job).toMatchObject({
      stage: "failed",
      failedStage: "processing",
      assetId: "snapshot",
      bookmarkId: "bookmark",
    });
    await runSaveJob(job, settings);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(job.stage).toBe("saved");
  });

  it("recovers after a lost create response by attaching the retained upload", async () => {
    const job = makeJob();
    mocks.create.mockRejectedValueOnce(new Error("Connection lost"));
    await runSaveJob(job, settings);
    mocks.create.mockResolvedValue({ id: "existing", alreadyExists: true });
    mocks.get.mockResolvedValue({ assets: [] });
    await runSaveJob(job, settings);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.attach).toHaveBeenCalledWith({
      bookmarkId: "existing",
      asset: { id: "snapshot", assetType: "precrawledArchive" },
    });
  });

  it("skips capture when a context-menu bookmark targets a different page", async () => {
    const reply = await handleSaveMessage({
      type: "START_SAVE",
      tabId: 2,
      tabUrl: "https://source.test",
      bookmark: { type: BookmarkTypes.LINK, url: "https://target.test" },
    });
    expect(reply.job?.capture).toBe(false);
    await vi.waitFor(() => expect(storage[saveJobKey(2)]?.stage).toBe("saved"));
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("continues after popup disconnection and reconnects to the same save", async () => {
    let complete!: (html: string) => void;
    mocks.capture.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
    );
    const message = {
      type: "START_SAVE" as const,
      tabId: 3,
      tabUrl: makeJob().tabUrl,
      bookmark: makeJob().bookmark,
    };
    const first = await handleSaveMessage(message);
    const duplicate = await handleSaveMessage(message);
    expect(duplicate.job?.id).toBe(first.job?.id);
    const differentTarget = await handleSaveMessage({
      ...message,
      bookmark: { type: BookmarkTypes.LINK, url: "https://another.test" },
    });
    expect(differentTarget.error).toContain("Another bookmark");
    complete("<html>Private content</html>");
    await vi.waitFor(() => expect(storage[saveJobKey(3)]?.stage).toBe("saved"));
    const reopened = await handleSaveMessage({
      type: "GET_SAVE",
      tabId: 3,
      tabUrl: message.tabUrl,
    });
    expect(reopened.job).toMatchObject({ id: first.job?.id, stage: "saved" });
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("surfaces a worker interruption instead of leaving the popup spinning", async () => {
    storage[saveJobKey(4)] = { ...makeJob(), tabId: 4, stage: "uploading" };
    const reply = await handleSaveMessage({
      type: "GET_SAVE",
      tabId: 4,
      tabUrl: makeJob().tabUrl,
    });
    expect(reply.job).toMatchObject({
      stage: "failed",
      failedStage: "uploading",
    });
  });

  it("requires an explicit choice before saving only the link", async () => {
    mocks.capture.mockRejectedValue(new Error("Permission denied"));
    const first = await handleSaveMessage({
      type: "START_SAVE",
      tabId: 5,
      tabUrl: makeJob().tabUrl,
      bookmark: makeJob().bookmark,
    });
    await vi.waitFor(() =>
      expect(storage[saveJobKey(5)]?.stage).toBe("failed"),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    await handleSaveMessage({
      type: "RETRY_SAVE",
      tabId: 5,
      jobId: first.job!.id,
      linkOnly: true,
    });
    await vi.waitFor(() => expect(storage[saveJobKey(5)]?.stage).toBe("saved"));
    expect(mocks.create).toHaveBeenCalledWith({
      ...makeJob().bookmark,
      clientRequestId: expect.any(String),
    });
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });

  it("does not reuse uploaded assets after changing servers or credentials", async () => {
    const first = await handleSaveMessage({
      type: "START_SAVE",
      tabId: 6,
      tabUrl: makeJob().tabUrl,
      bookmark: makeJob().bookmark,
    });
    await vi.waitFor(() => expect(storage[saveJobKey(6)]?.stage).toBe("saved"));
    storage[saveJobKey(6)].stage = "failed";
    mocks.settings.mockResolvedValue({
      ...settings,
      apiKey: "another-account",
    });
    const reply = await handleSaveMessage({
      type: "RETRY_SAVE",
      tabId: 6,
      jobId: first.job!.id,
    });
    expect(reply.error).toContain("connection changed");
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});

describe("failed save recovery", () => {
  it("discards an old-connection checkpoint and starts with the current connection", async () => {
    const old = {
      ...makeJob(),
      stage: "failed" as const,
      assetId: "old-upload",
      bookmarkId: "old-bookmark",
    };
    storage[saveJobKey(1)] = old;
    expect(
      (await handleSaveMessage({ type: "RETRY_SAVE", tabId: 1, jobId: old.id }))
        .error,
    ).toContain("connection changed");
    expect(
      await handleSaveMessage({
        type: "DISCARD_SAVE",
        tabId: 1,
        jobId: old.id,
      }),
    ).toEqual({});
    expect(storage[saveJobKey(1)]).toBeUndefined();
    const next = await handleSaveMessage({
      type: "START_SAVE",
      tabId: 1,
      tabUrl: old.tabUrl,
      bookmark: old.bookmark,
    });
    expect(next.job?.id).not.toBe(old.id);
    await vi.waitFor(() => expect(storage[saveJobKey(1)]?.stage).toBe("saved"));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: next.job?.id,
        precrawledArchiveId: "snapshot",
      }),
    );
  });

  it("does not discard a different or running job", async () => {
    let finish!: (html: string) => void;
    mocks.capture.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const start = await handleSaveMessage({
      type: "START_SAVE",
      tabId: 1,
      tabUrl: makeJob().tabUrl,
      bookmark: makeJob().bookmark,
    });
    expect(
      (
        await handleSaveMessage({
          type: "DISCARD_SAVE",
          tabId: 1,
          jobId: start.job!.id,
        })
      ).error,
    ).toContain("failed save");
    expect(
      (
        await handleSaveMessage({
          type: "DISCARD_SAVE",
          tabId: 1,
          jobId: "different",
        })
      ).error,
    ).toContain("failed save");
    finish("<html>Saved</html>");
    await vi.waitFor(() => expect(storage[saveJobKey(1)]?.stage).toBe("saved"));
  });

  it("reuses the job request key after losing a text-create response", async () => {
    const textJob: SaveJob = {
      ...makeJob(),
      capture: false,
      bookmark: { type: BookmarkTypes.TEXT, text: "Selected text" },
    };
    mocks.create.mockRejectedValueOnce(new Error("Response lost"));
    await runSaveJob(textJob, settings);
    expect(textJob.stage).toBe("failed");
    await runSaveJob(textJob, settings);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    for (const [request] of mocks.create.mock.calls)
      expect(request.clientRequestId).toBe(textJob.id);
    expect(textJob.stage).toBe("saved");
  });
});
