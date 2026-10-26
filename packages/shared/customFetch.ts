import { Agent, Dispatcher, ProxyAgent, fetch as undiciFetch } from "undici";

// Dispatchers are reused across calls so that clients built per job (e.g. the
// inference, embeddings and asset-preprocessing workers) share a connection
// pool instead of opening fresh sockets each time.
const dispatchers = new Map<string, Dispatcher>();

function getDispatcher(timeoutMs: number, proxyUrl?: string): Dispatcher {
  const key = `${proxyUrl ?? ""}:${timeoutMs}`;
  let dispatcher = dispatchers.get(key);
  if (!dispatcher) {
    const opts = { headersTimeout: timeoutMs, bodyTimeout: timeoutMs };
    dispatcher = proxyUrl
      ? new ProxyAgent({ uri: proxyUrl, ...opts })
      : new Agent(opts);
    dispatchers.set(key, dispatcher);
  }
  return dispatcher;
}

// Creates a fetch whose undici headers/body timeouts match the given timeout.
// Without this, undici's defaults (5 mins) cut off slow inference requests
// regardless of the configured timeout. We use undici's own fetch alongside
// its Agent so that the fetch and the dispatcher come from the same undici copy.
export function createCustomFetch(
  timeoutMs: number,
  proxyUrl?: string,
): typeof fetch {
  const dispatcher = getDispatcher(timeoutMs, proxyUrl);
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(
      input as Parameters<typeof undiciFetch>[0],
      { ...init, dispatcher } as Parameters<typeof undiciFetch>[1],
    )) as unknown as typeof fetch;
}
