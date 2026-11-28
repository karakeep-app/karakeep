import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { sortTtsChunks } from "@karakeep/shared/utils/ttsChunkUtils";

export interface TtsSnapshot {
  // Asset ids of the chunks that exist right now, in playback order.
  assetIds: string[];
  // Chunks the job will produce in total. Falls back to what exists for
  // narrations generated before the total was recorded.
  totalChunks: number;
  status: ZBookmark["ttsStatus"];
}

export function getTtsSnapshot(bookmark: ZBookmark): TtsSnapshot {
  const assetIds = sortTtsChunks(
    bookmark.assets.filter((a) => a.assetType === "ttsAudio"),
  ).map((a) => a.id);
  return {
    assetIds,
    totalChunks: Math.max(bookmark.ttsTotalChunks ?? 0, assetIds.length),
    status: bookmark.ttsStatus,
  };
}

export type ChunkWaitResult =
  | { kind: "ready"; assetId: string }
  // Past the last chunk of a finished narration.
  | { kind: "ended" }
  // The job failed (or we gave up waiting) before this chunk was produced.
  | { kind: "failed" }
  | { kind: "cancelled" };

export interface WaitForChunkOptions {
  getSnapshot: () => TtsSnapshot;
  // Fetches fresh state from the server and returns it.
  refetch: () => Promise<TtsSnapshot>;
  sleep?: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxWaitMs?: number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once chunk `index` can be played. If the chunk hasn't been
 * generated yet this polls with exponential backoff instead of treating the
 * end of the currently-known list as the end of the narration.
 */
export async function waitForTtsChunk(
  index: number,
  {
    getSnapshot,
    refetch,
    sleep = defaultSleep,
    isCancelled = () => false,
    initialDelayMs = 500,
    maxDelayMs = 5000,
    maxWaitMs = 10 * 60 * 1000,
  }: WaitForChunkOptions,
): Promise<ChunkWaitResult> {
  let delay = initialDelayMs;
  let waited = 0;
  let snap = getSnapshot();
  for (;;) {
    if (isCancelled()) {
      return { kind: "cancelled" };
    }
    if (index < snap.assetIds.length) {
      return { kind: "ready", assetId: snap.assetIds[index] };
    }
    if (snap.status === "failure") {
      return { kind: "failed" };
    }
    if (index >= snap.totalChunks && snap.status === "success") {
      return { kind: "ended" };
    }
    if (snap.status === null) {
      // No job at all; nothing will ever show up.
      return { kind: "ended" };
    }
    if (waited >= maxWaitMs) {
      return { kind: "failed" };
    }
    await sleep(delay);
    waited += delay;
    delay = Math.min(delay * 2, maxDelayMs);
    if (isCancelled()) {
      return { kind: "cancelled" };
    }
    try {
      snap = await refetch();
    } catch {
      // Transient network error: keep the last snapshot and try again.
      snap = getSnapshot();
    }
  }
}
