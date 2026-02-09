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
  const queryClient = useMemo(() => new QueryClient(), [settings]);
  const trpcClient = useMemo(() => getTRPCClient(settings), [settings]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
