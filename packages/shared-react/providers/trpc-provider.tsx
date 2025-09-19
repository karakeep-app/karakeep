import { useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { api } from "../trpc";

interface Settings {
  apiKey?: string;
  address: string;
}

function getTRPCClient(settings: Settings) {
  return api.createClient({
    links: [
      httpBatchLink({
        url: `${settings.address}/api/trpc`,
        maxURLLength: 14000,
        headers() {
          return {
            Authorization: settings.apiKey
              ? `Bearer ${settings.apiKey}`
              : undefined,
          };
        },
        transformer: superjson,
      }),
    ],
  });
}

export function TRPCProvider({
  settings,
  children,
}: {
  settings: Settings;
  children: React.ReactNode;
}) {
  const queryClient = useMemo(() => new QueryClient(), [settings]);
  const trpcClient = useMemo(() => getTRPCClient(settings), [settings]);

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
