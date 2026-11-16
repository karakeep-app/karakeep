import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ZTtsRequest } from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import {
  assets,
  AssetTypes,
  bookmarks,
  bookmarkTexts,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { runTts } from "./ttsWorker";

const mocks = await vi.hoisted(async () => {
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return {
    db: getInMemoryDB(true),
    saveAsset: vi.fn(),
    silentDeleteAsset: vi.fn(),
    getProvider: vi.fn(),
  };
});

vi.mock("@karakeep/db", async (original) => ({
  ...(await original<typeof import("@karakeep/db")>()),
  db: mocks.db,
}));

vi.mock("@karakeep/shared-server", async (original) => ({
  ...(await original<typeof import("@karakeep/shared-server")>()),
  saveAsset: mocks.saveAsset,
  silentDeleteAsset: mocks.silentDeleteAsset,
  QuotaService: {
    checkStorageQuota: vi.fn().mockResolvedValue({ approved: true }),
  },
  TtsProviderConfigService: { get: mocks.getProvider },
}));

// Bare-specifier imports that only resolve through the app's tsconfig paths.
vi.mock("../metrics", () => ({
  workerStatsCounter: { labels: () => ({ inc: vi.fn() }) },
}));
vi.mock("../workerTracing", () => ({
  withWorkerTracing: (_name: string, fn: unknown) => fn,
  withWorkerEventLog: (_name: string, fn: unknown) => fn,
}));

const db = mocks.db;

function buildJob(bookmarkId: string): DequeuedJob<ZTtsRequest> {
  return {
    id: "job",
    data: { bookmarkId },
    priority: 0,
    runNumber: 0,
    abortSignal: new AbortController().signal,
  };
}

async function createTextBookmark(paragraphs: number) {
  const [user] = await db
    .insert(users)
    .values({ name: "T", email: `${crypto.randomUUID()}@test.com` })
    .returning();
  const [bm] = await db
    .insert(bookmarks)
    .values({
      userId: user.id,
      type: BookmarkTypes.TEXT,
      ttsStatus: "pending",
    })
    .returning();
  await db.insert(bookmarkTexts).values({
    id: bm.id,
    text: Array.from({ length: paragraphs }, (_, i) => `Paragraph ${i}.`).join(
      "\n\n",
    ),
  });
  return { user, bookmarkId: bm.id };
}

const readBookmark = async (id: string) =>
  (await db.query.bookmarks.findFirst({ where: eq(bookmarks.id, id) }))!;
const readChunks = (id: string) =>
  db.query.assets.findMany({
    where: eq(assets.bookmarkId, id),
    orderBy: assets.fileName,
  });

describe("runTts", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.saveAsset.mockReset().mockResolvedValue(undefined);
    mocks.silentDeleteAsset.mockReset().mockResolvedValue(undefined);
    mocks.getProvider.mockReset().mockResolvedValue({
      provider: "openai-compatible",
      baseUrl: "http://tts.local",
      apiKey: null,
      model: "m",
      voice: "v",
    });
    fetchMock = vi.fn(
      async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  test("inserts one row per chunk, in order, as each is saved", async () => {
    const { bookmarkId } = await createTextBookmark(3);
    const observed: { rows: string[]; status: string | null }[] = [];
    mocks.saveAsset.mockImplementation(async () => {
      // Runs before the row for this chunk is inserted, so it shows what a
      // client could see mid-job.
      const rows = await readChunks(bookmarkId);
      observed.push({
        rows: rows.map((r) => r.fileName!),
        status: (await readBookmark(bookmarkId)).ttsStatus,
      });
    });

    await runTts(buildJob(bookmarkId));

    expect(observed.map((o) => o.rows)).toEqual([
      [],
      ["tts-00000.mp3"],
      ["tts-00000.mp3", "tts-00001.mp3"],
    ]);
    // After the first chunk is visible the status is "generating".
    expect(observed.map((o) => o.status)).toEqual([
      "pending",
      "generating",
      "generating",
    ]);
    const rows = await readChunks(bookmarkId);
    expect(rows.map((r) => r.fileName)).toEqual([
      "tts-00000.mp3",
      "tts-00001.mp3",
      "tts-00002.mp3",
    ]);
    expect(rows.every((r) => r.assetType === AssetTypes.TTS_AUDIO)).toBe(true);
    const bm = await readBookmark(bookmarkId);
    expect(bm.ttsStatus).toBe("success");
    expect(bm.ttsTotalChunks).toBe(3);
  });

  test("a single-chunk narration goes straight to success", async () => {
    const { bookmarkId } = await createTextBookmark(1);
    await runTts(buildJob(bookmarkId));
    const bm = await readBookmark(bookmarkId);
    expect(bm.ttsStatus).toBe("success");
    expect(bm.ttsTotalChunks).toBe(1);
  });

  test("a background failure marks failure and keeps the saved chunks", async () => {
    const { bookmarkId } = await createTextBookmark(3);
    let calls = 0;
    fetchMock.mockImplementation(async () => {
      if (++calls === 3) {
        return new Response("boom", { status: 500 });
      }
      return new Response(new Uint8Array([1]), { status: 200 });
    });

    await expect(runTts(buildJob(bookmarkId))).rejects.toThrow(/500/);

    const bm = await readBookmark(bookmarkId);
    expect(bm.ttsStatus).toBe("failure");
    expect(bm.ttsTotalChunks).toBe(3);
    expect((await readChunks(bookmarkId)).map((r) => r.fileName)).toEqual([
      "tts-00000.mp3",
      "tts-00001.mp3",
    ]);
  });

  test("regenerating replaces old chunks instead of mixing", async () => {
    const { user, bookmarkId } = await createTextBookmark(2);
    await runTts(buildJob(bookmarkId));
    const oldIds = (await readChunks(bookmarkId)).map((r) => r.id);

    await runTts(buildJob(bookmarkId));

    const rows = await readChunks(bookmarkId);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => oldIds.includes(r.id))).toBe(false);
    for (const id of oldIds) {
      expect(mocks.silentDeleteAsset).toHaveBeenCalledWith(user.id, id);
    }
  });

  test("cleans up the stored file when its row insert fails", async () => {
    const { user, bookmarkId } = await createTextBookmark(1);
    // An existing row with the same primary key makes the insert fail.
    let savedId = "";
    mocks.saveAsset.mockImplementation(async ({ assetId }) => {
      savedId = assetId;
      await db.insert(assets).values({
        id: assetId,
        bookmarkId,
        userId: user.id,
        assetType: AssetTypes.TTS_AUDIO,
        contentType: "audio/mpeg",
        size: 1,
      });
    });
    await expect(runTts(buildJob(bookmarkId))).rejects.toThrow();
    expect(mocks.silentDeleteAsset).toHaveBeenCalledWith(user.id, savedId);
  });
});
