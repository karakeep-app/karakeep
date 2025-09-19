import serverConfig from "./config";

// Generic fetch function type that works across environments
type FetchFunction = (
  input: RequestInfo | URL | string,
  init?: RequestInit,
) => Promise<Response>;

// Factory function to create a custom fetch with timeout for any fetch implementation
export function createCustomFetch(fetchImpl: FetchFunction = globalThis.fetch) {
  return function customFetch(
    input: Parameters<typeof fetchImpl>[0],
    init?: Parameters<typeof fetchImpl>[1],
  ): ReturnType<typeof fetchImpl> {
    const timeout = serverConfig.inference.fetchTimeoutSec * 1000; // Convert to milliseconds
    return fetchImpl(input, {
      signal: AbortSignal.timeout(timeout),
      ...init,
    });
  };
}

// Default export for backward compatibility - uses global fetch
export const customFetch = createCustomFetch();
