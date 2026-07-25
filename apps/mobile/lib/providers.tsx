import { useEffect, useMemo, useState } from "react";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Toaster } from "sonner-native";

import { TRPCSettingsProvider } from "@karakeep/shared-react/providers/trpc-provider";

import {
  CACHE_MAX_AGE,
  dehydrateOptions,
  makeMobileQueryClient,
  queryPersister,
  setupCachePersistence,
  setupOnlineManager,
} from "./offlineCache";
import { ConnectionStatusProvider } from "./useConnectionStatus";
import { ReaderSettingsProvider } from "./readerSettings";
import useAppSettings from "./settings";

export function Providers({ children }: { children: React.ReactNode }) {
  const { settings, isLoading, load } = useAppSettings();
  const [queryClient] = useState(() => makeMobileQueryClient());

  useEffect(() => {
    load();
    setupOnlineManager();
    return setupCachePersistence();
  }, []);

  const buster = `${settings.address}|${settings.apiKeyId ?? "anon"}`;
  const persistOptions = useMemo(
    () => ({
      persister: queryPersister,
      maxAge: CACHE_MAX_AGE,
      buster,
      dehydrateOptions,
    }),
    [buster],
  );

  if (isLoading) {
    // Don't render anything if the settings still hasn't been loaded
    return <FullPageSpinner />;
  }

  return (
    <PersistQueryClientProvider
      key={buster}
      client={queryClient}
      persistOptions={persistOptions}
    >
      <TRPCSettingsProvider settings={settings} queryClient={queryClient}>
        <ConnectionStatusProvider enabled={!!settings.apiKey}>
          <ReaderSettingsProvider>
            {children}
            <Toaster />
          </ReaderSettingsProvider>
        </ConnectionStatusProvider>
      </TRPCSettingsProvider>
    </PersistQueryClientProvider>
  );
}
