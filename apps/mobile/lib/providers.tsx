import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineDownloadSync } from "@/components/OfflineDownloadSync";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SIDEBAR_WIDTH, useShowSidebar } from "@/lib/responsive";
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
  const insets = useSafeAreaInsets();
  // The dashboard's sidebar only shows once signed in.
  const showSidebar = useShowSidebar() && !!settings.apiKey;
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
                  toastOptions={{
                    // Center toasts over the content, clear of the sidebar
                    // and iPhone Duo's rail.
                    toastContainerStyle: {
                      paddingLeft:
                        insets.left + (showSidebar ? SIDEBAR_WIDTH : 0),
                      paddingRight: insets.right,
                    },
                    // Raised above the near-black cards and page in dark mode.
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
