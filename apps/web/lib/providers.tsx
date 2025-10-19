"use client";

import type { UserLocalSettings } from "@/lib/userLocalSettings/types";
import type { AuthSession } from "@/server/auth";
import React, { useEffect, useState } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UserLocalSettingsCtx } from "@/lib/userLocalSettings/bookmarksLayout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

import type { ClientConfig } from "@karakeep/shared/config";

import { authClient } from "./auth-client";
import { ClientConfigCtx } from "./clientConfig";
import CustomI18nextProvider from "./i18n/provider";
import { api } from "./trpc";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important so we don't re-make a new client if React
    // supsends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export default function Providers({
  children,
  session,
  clientConfig,
  userLocalSettings,
}: {
  children: React.ReactNode;
  session: AuthSession | null;
  clientConfig: ClientConfig;
  userLocalSettings: UserLocalSettings;
}) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchLink({
          // TODO: Change this to be a full URL exposed as a client side setting
          url: `/api/trpc`,
          maxURLLength: 14000,
          transformer: superjson,
        }),
      ],
    }),
  );

  useEffect(() => {
    const store = authClient.$store.atoms.session;
    const current = store.get();
    store.set({
      ...current,
      data: session,
      error: null,
      isPending: false,
      isRefetching: false,
    });
  }, [session]);

  return (
    <ClientConfigCtx.Provider value={clientConfig}>
      <UserLocalSettingsCtx.Provider value={userLocalSettings}>
        <api.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <CustomI18nextProvider lang={userLocalSettings.lang}>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
              </ThemeProvider>
            </CustomI18nextProvider>
          </QueryClientProvider>
        </api.Provider>
      </UserLocalSettingsCtx.Provider>
    </ClientConfigCtx.Provider>
  );
}
