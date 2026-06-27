import { Agent } from "undici";
import type { Dispatcher } from "undici";

import serverConfig from "./config";

// Extends standard RequestInit with undici's dispatcher option for controlling
// internal timeouts (bodyTimeout, headersTimeout) that AbortSignal cannot reach.
interface FetchInit extends RequestInit {
  dispatcher?: Dispatcher;
}

type FetchFunction = (
  input: RequestInfo | URL | string,
  init?: FetchInit,
) => Promise<Response>;

// Factory function to create a custom fetch with timeout for any fetch implementation
export function createCustomFetch(fetchImpl: FetchFunction = globalThis.fetch) {
  const timeout = serverConfig.inference.fetchTimeoutSec * 1000;
  // Create once per factory call — Agent manages a connection pool; one per request would leak.
  // undici's bodyTimeout/headersTimeout default to 300 s independently of AbortSignal,
  // so we must set them here for INFERENCE_FETCH_TIMEOUT_SEC to take effect.
  const defaultDispatcher = new Agent({
    headersTimeout: timeout,
    bodyTimeout: timeout,
  });

  return function customFetch(
    input: Parameters<typeof fetchImpl>[0],
    init?: Parameters<typeof fetchImpl>[1],
  ): ReturnType<typeof fetchImpl> {
    // Merge timeout signal with any signal from the caller (e.g. Ollama SDK's internal signal).
    // Must not simply overwrite: spread order would let init.signal replace our timeout signal.
    const signal =
      init?.signal instanceof AbortSignal
        ? AbortSignal.any([AbortSignal.timeout(timeout), init.signal])
        : AbortSignal.timeout(timeout);
    return fetchImpl(input, {
      ...init,
      signal,
      // Caller's dispatcher takes precedence (e.g. a proxy); fall back to ours for timeout control.
      dispatcher: init?.dispatcher ?? defaultDispatcher,
    });
  };
}

// Default export for backward compatibility - uses global fetch
export const customFetch = createCustomFetch();
