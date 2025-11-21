import { useMemo } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";

import { api } from "./trpc";
import { createAsyncStoragePersister } from "./query-persister";

interface Settings {
  apiKey?: string;
  address?: string;
  customHeaders?: Record<string, string>;
}

function getTRPCClient(settings: Settings) {
  return api.createClient({
    links: [
      httpBatchLink({
        url: `${settings.address || "https://cloud.karakeep.app"}/api/trpc`,
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

export function TRPCProviderWithPersistence({
  settings,
  children,
}: {
  settings: Settings;
  children: React.ReactNode;
}) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Enable offline mode features
            gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days - keep data in cache for longer
            staleTime: 1000 * 60 * 5, // 5 minutes - data is considered fresh for 5 minutes
            retry: 2, // Retry failed queries twice before giving up
            networkMode: "offlineFirst", // Try cache first, then network
          },
          mutations: {
            networkMode: "offlineFirst", // Try mutations even when offline, queue them
          },
        },
      }),
    [settings]
  );

  const trpcClient = useMemo(() => getTRPCClient(settings), [settings]);
  const persister = useMemo(() => createAsyncStoragePersister(), []);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Only persist successful queries
            return query.state.status === "success";
          },
        },
      }}
    >
      <api.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </api.Provider>
    </PersistQueryClientProvider>
  );
}
