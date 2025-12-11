import { createTRPCClient, httpBatchLink, retryLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

export type TrpcClient = ReturnType<typeof getTrpcClient>;

export function getTrpcClient(apiKey?: string) {
  if (!process.env.KARAKEEP_PORT) {
    throw new Error("KARAKEEP_PORT is not set. Did you start the containers?");
  }

  return createTRPCClient<AppRouter>({
    links: [
      retryLink({
        retry(opts) {
          if (!opts.error.message.includes("fetch failed")) {
            return false;
          }
          // Retry up to 3 times
          return opts.attempts <= 3;
        },
        // Double every attempt, with max of 30 seconds (starting at 1 second)
        retryDelayMs: (attemptIndex) =>
          Math.min(1000 * 2 ** attemptIndex, 30000),
      }),
      httpBatchLink({
        transformer: superjson,
        url: `http://localhost:${process.env.KARAKEEP_PORT}/api/trpc`,
        headers() {
          return {
            authorization: apiKey ? `Bearer ${apiKey}` : undefined,
          };
        },
        // Increase fetch timeout to handle long-running operations
        fetch(url, options) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60 second timeout

          return fetch(url, {
            ...options,
            signal: controller.signal,
          } as RequestInit).finally(() => clearTimeout(timeoutId));
        },
      }),
    ],
  });
}
