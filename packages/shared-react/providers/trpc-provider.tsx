import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@karakeep/trpc/routers/_app";

import { TRPCProvider } from "../trpc";

interface Settings {
  apiKey?: string;
  address: string;
  customHeaders?: Record<string, string>;
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return new QueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = new QueryClient();
    return browserQueryClient;
  }
}

function getTRPCClient(settings: Settings) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${settings.address}/api/trpc`,
        maxURLLength: 14000,
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
