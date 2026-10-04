import { Agent, ProxyAgent, fetch as undiciFetch } from "undici";

// Creates a fetch whose undici headers/body timeouts match the given timeout.
// Without this, undici's defaults (5 mins) cut off slow inference requests
// regardless of the configured timeout. We use undici's own fetch alongside
// its Agent so that the fetch and the dispatcher come from the same undici copy.
export function createCustomFetch(
  timeoutMs: number,
  proxyUrl?: string,
): typeof fetch {
  const opts = { headersTimeout: timeoutMs, bodyTimeout: timeoutMs };
  const dispatcher = proxyUrl
    ? new ProxyAgent({ uri: proxyUrl, ...opts })
    : new Agent(opts);
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
    )) as unknown as typeof fetch;
}
