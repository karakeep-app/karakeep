import serverConfig from "./config";

type FetchFunction = (
  input: RequestInfo | URL | string,
  init?: RequestInit,
) => Promise<Response>;

function mergeSignals(...signals: (AbortSignal | null | undefined)[]): AbortSignal {
  const defined = signals.filter((s): s is AbortSignal => s != null);
  if (defined.length === 0) return new AbortController().signal;
  if (defined.length === 1) return defined[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(defined);
  const controller = new AbortController();
  for (const signal of defined) {
    if (signal.aborted) { controller.abort(signal.reason); break; }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export function createCustomFetch(fetchImpl: FetchFunction = globalThis.fetch) {
  const timeoutMs = serverConfig.inference.fetchTimeoutSec * 1000;

  // Resolved once at factory time; undefined if undici isn't the http client
  const dispatcherPromise: Promise<unknown> = import("undici")
    .then(({ Agent }) => new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs }))
    .catch(() => undefined);

  return async function customFetch(
    input: Parameters<typeof fetchImpl>[0],
    init?: Parameters<typeof fetchImpl>[1],
  ): Promise<Response> {
    const dispatcher = await dispatcherPromise;

    const controller = new AbortController();
    const signal = mergeSignals(controller.signal, init?.signal as AbortSignal);

    const headerTimer = setTimeout(() => {
      controller.abort(
        new DOMException("Timed out waiting for response headers", "TimeoutError"),
      );
    }, timeoutMs);

    return fetchImpl(input, {
      ...init,
      ...(dispatcher ? { dispatcher } : {}),
      signal,
    } as RequestInit)
      .then((response) => {
        clearTimeout(headerTimer);

        const bodyTimer = setTimeout(
          () => controller.abort(new DOMException("Timed out reading response body", "TimeoutError")),
          timeoutMs,
        );

        if (!response.body) {
          clearTimeout(bodyTimer);
          return response;
        }

        const clearBodyTimer = () => clearTimeout(bodyTimer);
        const passthrough = new TransformStream({ flush: clearBodyTimer });
        response.body.pipeTo(passthrough.writable).catch(clearBodyTimer);

        return new Response(passthrough.readable, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      })
      .catch((error) => {
        clearTimeout(headerTimer);
        throw error;
      });
  };
}

export const customFetch = createCustomFetch();