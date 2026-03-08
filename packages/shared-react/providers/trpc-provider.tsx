import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { TRPC_MAX_URL_LENGTH_EXTERNAL, TRPCProvider } from "../trpc";

interface Settings {
  apiKey?: string;
  address: string;
  customHeaders?: Record<string, string>;
}

let browserQueryClient: QueryClient | undefined = undefined;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
  });
}

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

function getTRPCClient(settings: Settings) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${settings.address}/api/trpc`,
        maxURLLength: TRPC_MAX_URL_LENGTH_EXTERNAL,
        fetch: (url, options) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30_000);

          // Forward any existing abort signal from tRPC / React Query
          const externalSignal = options?.signal as AbortSignal | undefined;
          let onAbort: (() => void) | undefined;
          if (externalSignal) {
            if (externalSignal.aborted) {
              controller.abort(externalSignal.reason);
            } else {
              onAbort = () => controller.abort(externalSignal.reason);
              externalSignal.addEventListener("abort", onAbort);
            }
          }

          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).then(
            (response) => {
              clearTimeout(timeout);
              if (onAbort)
                externalSignal!.removeEventListener("abort", onAbort);
              return response;
            },
            (error) => {
              clearTimeout(timeout);
              if (onAbort)
                externalSignal!.removeEventListener("abort", onAbort);
              throw error;
            },
          );
        },
        headers() {
          return {
            Authorization: settings.apiKey
              ? `Bearer ${settings.apiKey}`
              : undefined,
            ...settings.customHeaders,
          };
        },
        transformer: superjson,
      }),
    ],
  });
}

export function TRPCSettingsProvider({
  settings,
  children,
}: {
  settings: Settings;
  children: React.ReactNode;
}) {
  const queryClient = getQueryClient();
  const trpcClient = useMemo(() => getTRPCClient(settings), [settings]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
