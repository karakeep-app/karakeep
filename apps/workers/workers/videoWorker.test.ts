import fs from "fs";
import * as os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockDownload,
  mockSaveAssetFromFile,
  mockUpdateAsset,
  mockCheckStorageQuota,
  mockGetBookmarkDetails,
} = vi.hoisted(() => ({
  mockDownload: vi.fn(),
  mockSaveAssetFromFile: vi.fn(),
  mockUpdateAsset: vi.fn(),
  mockCheckStorageQuota: vi.fn(),
  mockGetBookmarkDetails: vi.fn(),
}));

vi.mock("@karakeep/db", () => ({
  db: {
    transaction: async (fn: (txn: unknown) => Promise<void> | void) =>
      fn("mock-txn"),
  },
}));
vi.mock("@karakeep/db/schema", () => ({
  AssetTypes: {
    LINK_VIDEO: "linkVideo",
  },
}));
vi.mock("@karakeep/shared/config", () => ({
  default: {
    prometheus: { enabled: false },
    sandbox: { url: undefined },
    crawler: {
      downloadVideo: true,
      downloadVideoOnDemand: true,
      downloadVideoTimeout: 60,
    },
  },
}));
vi.mock("@karakeep/shared-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@karakeep/shared-server")>();
  return {
    ...actual,
    addLogFields: vi.fn(),
    newAssetId: () => "new-video-asset-id",
    QuotaService: {
      ...actual.QuotaService,
      checkStorageQuota: mockCheckStorageQuota,
    },
    saveAssetFromFile: mockSaveAssetFromFile,
    silentDeleteAsset: vi.fn(),
  };
});
vi.mock("../workerUtils", () => ({
  getBookmarkDetails: mockGetBookmarkDetails,
  updateAsset: mockUpdateAsset,
}));
vi.mock("./video/localVideoDownloader", () => ({
  localVideoDownloader: { download: mockDownload },
}));
vi.mock("./video/remoteVideoDownloader", () => ({
  remoteVideoDownloader: { download: mockDownload },
}));
vi.mock("../network", () => ({
  selectRunProxies: () => ({
    httpProxy: undefined,
    httpsProxy: undefined,
    noProxy: undefined,
  }),
}));

import { runWorker } from "./videoWorker";

describe("videoWorker", () => {
  const createdFiles: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(
      createdFiles
        .splice(0)
        .map((file) => fs.promises.rm(file, { force: true })),
    );
  });

  it("saves the downloaded video's actual contentType in metadata and DB", async () => {
    const tmpFile = path.join(os.tmpdir(), `worker-video-${Date.now()}.webm`);
    createdFiles.push(tmpFile);
    await fs.promises.writeFile(tmpFile, Buffer.from("webm-bytes"));

    mockGetBookmarkDetails.mockResolvedValueOnce({
      url: "https://example.com/watch?v=1",
      userId: "user-1",
      videoAssetId: "old-asset-1",
    });
    mockDownload.mockResolvedValueOnce({
      status: "downloaded",
      path: tmpFile,
      contentType: "video/webm",
    });
    mockCheckStorageQuota.mockResolvedValueOnce({
      userId: "user-1",
      approvedSize: 10,
    });

    await runWorker({
      id: "job-1",
      data: { bookmarkId: "bm-1", onDemand: false },
      abortSignal: new AbortController().signal,
    } as never);

    expect(mockSaveAssetFromFile).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "new-video-asset-id",
        assetPath: tmpFile,
        metadata: { contentType: "video/webm" },
      }),
    );
    expect(mockUpdateAsset).toHaveBeenCalledWith(
      "old-asset-1",
      expect.objectContaining({
        id: "new-video-asset-id",
        bookmarkId: "bm-1",
        userId: "user-1",
        assetType: "linkVideo",
        contentType: "video/webm",
        size: 10,
      }),
      "mock-txn",
    );
  });
});
