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

  const logout = useCallback(async () => {
    // Finish signing out of RevenueCat before the next user can sign in, so
    // a late reset can't log out the next user's purchases identity.
    await resetPurchasesUser();
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
  }, [deleteKey, queryClient, settings, setSettings]);

  return {
    logout,
  };
}

export function useIsLoggedIn() {
  const { settings, isLoading } = useAppSettings();

  return isLoading ? undefined : !!settings.apiKey;
}
