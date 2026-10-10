import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";

import { clearPersistedCache } from "./offlineCache";
import { clearOfflineLibrary } from "./offlineLibrary";
import useAppSettings from "./settings";
import { useAutomaticOffline } from "./automaticOffline";

export function useSession() {
  const { cancel } = useAutomaticOffline();
  const { settings, setSettings } = useAppSettings();
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { mutate: deleteKey } = useMutation(
    api.apiKeys.revoke.mutationOptions(),
  );

  const logout = useCallback(() => {
    cancel();
    if (settings.apiKeyId) {
      deleteKey({ id: settings.apiKeyId });
    }
    setSettings({ ...settings, apiKey: undefined, apiKeyId: undefined });
    queryClient.clear();
    clearPersistedCache();
    clearOfflineLibrary();
  }, [cancel, deleteKey, queryClient, settings, setSettings]);

  return {
    logout,
  };
}

export function useIsLoggedIn() {
  const { settings, isLoading } = useAppSettings();

  return isLoading ? undefined : !!settings.apiKey;
}
