import { useCallback } from "react";

import useAppSettings from "./settings";
import { api } from "./trpc";

export function useSession() {
  const { settings, setSettings } = useAppSettings();

  const { mutate: deleteKey } = api.apiKeys.revoke.useMutation();

  const logout = useCallback(() => {
    if (settings.apiKeyId) {
      deleteKey({ id: settings.apiKeyId });
    }
    setSettings({ ...settings, apiKey: undefined, apiKeyId: undefined });
  }, [settings, setSettings]);

  return {
    logout,
  };
}

export function useIsLoggedIn() {
  const { settings, isLoading } = useAppSettings();

  return isLoading ? undefined : !!settings.apiKey;
}
