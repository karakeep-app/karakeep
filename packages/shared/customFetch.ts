import logger from "./logger";
import serverConfig from "./config";

type FetchFunction = (
  input: RequestInfo | URL | string,
  init?: RequestInit,
) => Promise<Response>;

function mergeSignals(
  ...signals: (AbortSignal | null | undefined)[]
): AbortSignal {
  const defined = signals.filter((s): s is AbortSignal => s != null);
  if (defined.length === 0) return new AbortController().signal;
  if (defined.length === 1) return defined[0];
  if (typeof AbortSignal.any === "function") return AbortSignal.any(defined);
  const controller = new AbortController();
  for (const signal of defined) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
    });
  }
  return controller.signal;
}

export function createCustomFetch(fetchImpl: FetchFunction = globalThis.fetch) {
  const timeoutMs = serverConfig.inference.fetchTimeoutSec * 1000;

  // Resolved once at factory time. When undici is available, use its own fetch
  // together with its Agent so that both come from the same undici copy.
  // Passing an npm undici Agent as the dispatcher of the runtime's built-in
  // fetch fails immediately on Node >= 24, which bundles a different undici
  // major (undici 7). Falls back to fetchImpl (e.g. in browsers).
  const undiciFetchPromise: Promise<FetchFunction | undefined> =
    import("undici")
      .then(({ fetch: undiciFetch, Agent }) => {
        const dispatcher = new Agent({
          headersTimeout: timeoutMs,
          bodyTimeout: timeoutMs,
        });
        return ((
          input: Parameters<typeof undiciFetch>[0],
          init?: Parameters<typeof undiciFetch>[1],
        ) =>
          undiciFetch(
            input as string | URL,
            {
              ...init,
              dispatcher,
            } as Parameters<typeof undiciFetch>[1],
          )) as unknown as FetchFunction;
      })
      .catch((error) => {
        logger.warn(
          `undici is not available, falling back to the global fetch: ${errorMessage(error)}`,
        );
        return undefined;
      });

  return async function customFetch(
    input: Parameters<typeof fetchImpl>[0],
    init?: Parameters<typeof fetchImpl>[1],
  ): Promise<Response> {
    const undiciFetch = await undiciFetchPromise;

    const controller = new AbortController();
    const signal = mergeSignals(controller.signal, init?.signal as AbortSignal);

    const headerTimer = setTimeout(() => {
      controller.abort(
        new DOMException(
          "Timed out waiting for response headers",
          "TimeoutError",
        ),
      );
    }, timeoutMs);

    const performFetch = () =>
      undiciFetch
        ? undiciFetch(input, { ...init, signal })
        : fetchImpl(input, { ...init, signal });

    return performFetch()
      .then((response) => {
        clearTimeout(headerTimer);

        const bodyTimer = setTimeout(() => {
          logger.error(
            `Timed out reading response body of ${String(input)} after ${timeoutMs}ms`,
          );
          controller.abort(
            new DOMException("Timed out reading response body", "TimeoutError"),
          );
        }, timeoutMs);

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
        logger.error(
          `customFetch to ${String(input)} failed: ${errorMessage(error)}`,
        );
        throw error;
      });
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (
      cause instanceof Error &&
      cause.message &&
      cause.message !== error.message
    ) {
      return `${error.message}: ${cause.message}`;
    }
    return error.message;
  }
  return String(error);
}

export const customFetch = createCustomFetch();
