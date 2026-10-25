import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { clearPersistedCache } from "./offlineCache";
import { clearOfflineDownloadStorage } from "./offlineDownloadPrefs";
import { clearOfflineLibrary } from "./offlineLibrary";
import { resetOfflineDownloads } from "./offlineSync";
import { resetPurchasesUser } from "./purchases";
import useAppSettings from "./settings";

export function useSession() {
  const { settings, setSettings } = useAppSettings();
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { mutate: deleteKey } = useMutation(
    api.apiKeys.revoke.mutationOptions(),
  );

  const logout = useCallback(() => {
    if (settings.apiKeyId) {
      deleteKey({ id: settings.apiKeyId });
    }
    setSettings({ ...settings, apiKey: undefined, apiKeyId: undefined });
    queryClient.clear();
    clearPersistedCache();
    clearOfflineLibrary();
    clearOfflineDownloadStorage();
    // After clearing: it notifies the download status screen, which reloads
    // from storage.
    resetOfflineDownloads();
    void resetPurchasesUser();
  }, [deleteKey, queryClient, settings, setSettings]);

  return {
    logout,
  };
}

export function useIsLoggedIn() {
  const { settings, isLoading } = useAppSettings();

  return isLoading ? undefined : !!settings.apiKey;
}
