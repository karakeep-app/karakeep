import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { OfflineDownloadSync } from "@/components/OfflineDownloadSync";
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
import { ClientConfigProvider } from "./client-config";
import { ConnectionStatusProvider } from "./useConnectionStatus";
import { I18nProvider } from "./i18n/provider";
import { ReaderSettingsProvider } from "./readerSettings";
import useAppSettings from "./settings";
import { useColorScheme } from "./useColorScheme";

export function Providers({ children }: { children: React.ReactNode }) {
  const { isDarkColorScheme } = useColorScheme();
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
        <ClientConfigProvider>
          <I18nProvider>
            <OfflineDownloadSync />
            <ConnectionStatusProvider enabled={!!settings.apiKey}>
              <ReaderSettingsProvider>
                {children}
                <Toaster
                  position="bottom-center"
                  offset={Platform.OS === "android" ? 170 : 100}
                  // Raised above the near-black cards and page in dark mode.
                  toastOptions={{
                    style: {
                      backgroundColor: isDarkColorScheme
                        ? "#3a3a3c"
                        : "#ffffff",
                      borderRadius: 16,
                    },
                    titleStyle: {
                      color: isDarkColorScheme ? "#ffffff" : "#000000",
                    },
                  }}
                />
              </ReaderSettingsProvider>
            </ConnectionStatusProvider>
          </I18nProvider>
        </ClientConfigProvider>
      </TRPCSettingsProvider>
    </PersistQueryClientProvider>
  );
}
