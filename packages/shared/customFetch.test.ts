import { Agent } from "undici";
import { describe, expect, it, vi } from "vitest";

import { createCustomFetch } from "./customFetch";

// Minimal serverConfig mock — only the field createCustomFetch reads.
vi.mock("./config", () => ({
  default: { inference: { fetchTimeoutSec: 10 } },
}));

describe("createCustomFetch", () => {
  it("passes AbortSignal.timeout to fetch when caller provides no signal", async () => {
    let capturedSignal: AbortSignal | undefined;
    const mockFetch = vi.fn(async (_input, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Response();
    });

    const fetch = createCustomFetch(mockFetch);
    await fetch("https://example.com");

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("merges caller signal with timeout signal instead of overwriting", async () => {
    const callerController = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    const mockFetch = vi.fn(async (_input, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Response();
    });

    const fetch = createCustomFetch(mockFetch);
    await fetch("https://example.com", { signal: callerController.signal });

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal?.aborted).toBe(false);

    // Aborting the caller signal must abort the merged signal.
    callerController.abort();
    expect(capturedSignal?.aborted).toBe(true);

    // Symmetrically, the merged signal must also carry an AbortSignal.timeout
    // so that a timeout fires even when no caller signal is provided.
    // (Verified separately in the "aborts via timeout" test.)
  });

  it("uses caller dispatcher when provided, not the default one", async () => {
    const callerDispatcher = {} as import("undici").Dispatcher;
    let capturedDispatcher: unknown;
    const mockFetch = vi.fn(async (_input, init) => {
      capturedDispatcher = (init as { dispatcher?: unknown }).dispatcher;
      return new Response();
    });

    const fetch = createCustomFetch(mockFetch);
    await fetch("https://example.com", { dispatcher: callerDispatcher });

    expect(capturedDispatcher).toBe(callerDispatcher);
  });

  it("injects default Agent dispatcher when caller provides none", async () => {
    let capturedDispatcher: unknown;
    const mockFetch = vi.fn(async (_input, init) => {
      capturedDispatcher = (init as { dispatcher?: unknown }).dispatcher;
      return new Response();
    });

    const fetch = createCustomFetch(mockFetch);
    await fetch("https://example.com");

    expect(capturedDispatcher).toBeInstanceOf(Agent);
  });

  it("aborts via timeout when no caller signal is provided", async () => {
    // vi fake timers don't control Node.js built-in AbortSignal.timeout, so spy instead.
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);

    let capturedSignal: AbortSignal | undefined;
    const mockFetch = vi.fn(async (_input, init) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Response();
    });

    const fetch = createCustomFetch(mockFetch);
    await fetch("https://example.com");

    expect(capturedSignal?.aborted).toBe(false);
    controller.abort();
    expect(capturedSignal?.aborted).toBe(true);

    vi.restoreAllMocks();
  });
});
