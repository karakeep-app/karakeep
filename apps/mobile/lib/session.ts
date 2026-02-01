import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

import useAppSettings from "./settings";
import { useTRPC } from "./trpc";

export function useSession() {
  const { settings, setSettings } = useAppSettings();
  const api = useTRPC();

  const { mutate: deleteKey } = useMutation(
    api.apiKeys.revoke.mutationOptions(),
  );

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
