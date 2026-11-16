import { describe, expect, test } from "vitest";

import type { TtsSnapshot } from "./ttsPlayback";
import { waitForTtsChunk } from "./ttsPlayback";

const snap = (
  n: number,
  total: number,
  status: TtsSnapshot["status"],
): TtsSnapshot => ({
  assetIds: Array.from({ length: n }, (_, i) => `a${i}`),
  totalChunks: total,
  status,
});

describe("waitForTtsChunk", () => {
  test("returns immediately when the chunk exists", async () => {
    const r = await waitForTtsChunk(0, {
      getSnapshot: () => snap(1, 3, "generating"),
      refetch: async () => snap(1, 3, "generating"),
      sleep: async () => undefined,
    });
    expect(r).toEqual({ kind: "ready", assetId: "a0" });
  });

  test("waits for a chunk that appears after playback of the first started", async () => {
    // Only chunk 0 exists when chunk 1 is requested; it shows up on the
    // third poll.
    let current = snap(1, 3, "generating");
    let polls = 0;
    const sleeps: number[] = [];
    const r = await waitForTtsChunk(1, {
      getSnapshot: () => current,
      refetch: async () => {
        polls++;
        if (polls === 3) {
          current = snap(2, 3, "generating");
        }
        return current;
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(r).toEqual({ kind: "ready", assetId: "a1" });
    expect(polls).toBe(3);
    // Exponential backoff, capped.
    expect(sleeps).toEqual([500, 1000, 2000]);
  });

  test("caps the backoff delay", async () => {
    let polls = 0;
    let current = snap(1, 3, "generating");
    const sleeps: number[] = [];
    await waitForTtsChunk(1, {
      getSnapshot: () => current,
      refetch: async () => {
        if (++polls === 6) current = snap(2, 3, "generating");
        return current;
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(Math.max(...sleeps)).toBe(5000);
  });

  test("reports failure when the job fails before the chunk exists", async () => {
    let current = snap(1, 3, "generating");
    const r = await waitForTtsChunk(1, {
      getSnapshot: () => current,
      refetch: async () => (current = snap(1, 3, "failure")),
      sleep: async () => undefined,
    });
    expect(r).toEqual({ kind: "failed" });
  });

  test("ends after the last chunk of a finished narration", async () => {
    const r = await waitForTtsChunk(3, {
      getSnapshot: () => snap(3, 3, "success"),
      refetch: async () => snap(3, 3, "success"),
      sleep: async () => undefined,
    });
    expect(r).toEqual({ kind: "ended" });
  });

  test("does not end while generation is still running", async () => {
    // Index is past what's available, but the job isn't done: keep waiting.
    let current = snap(1, 2, "generating");
    const r = await waitForTtsChunk(1, {
      getSnapshot: () => current,
      refetch: async () => (current = snap(2, 2, "success")),
      sleep: async () => undefined,
    });
    expect(r).toEqual({ kind: "ready", assetId: "a1" });
  });

  test("survives a failed refetch", async () => {
    let current = snap(1, 2, "generating");
    let calls = 0;
    const r = await waitForTtsChunk(1, {
      getSnapshot: () => current,
      refetch: async () => {
        if (++calls === 1) throw new Error("network");
        return (current = snap(2, 2, "generating"));
      },
      sleep: async () => undefined,
    });
    expect(r).toEqual({ kind: "ready", assetId: "a1" });
  });

  test("gives up after maxWaitMs", async () => {
    const r = await waitForTtsChunk(1, {
      getSnapshot: () => snap(1, 2, "generating"),
      refetch: async () => snap(1, 2, "generating"),
      sleep: async () => undefined,
      maxWaitMs: 3000,
    });
    expect(r).toEqual({ kind: "failed" });
  });

  test("stops when cancelled", async () => {
    let cancelled = false;
    const r = await waitForTtsChunk(1, {
      getSnapshot: () => snap(1, 2, "generating"),
      refetch: async () => snap(1, 2, "generating"),
      sleep: async () => {
        cancelled = true;
      },
      isCancelled: () => cancelled,
    });
    expect(r).toEqual({ kind: "cancelled" });
  });
});
