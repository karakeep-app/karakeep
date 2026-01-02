import { ImageURISource } from "react-native";
import { useQuery } from "@tanstack/react-query";

import useAppSettings from "./settings";
import { api } from "./trpc";
import { buildApiHeaders } from "./utils";

export function useAssetUrl(assetId: string): ImageURISource {
  const { settings } = useAppSettings();
  return {
    uri: `${settings.address}/api/assets/${assetId}`,
    headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
  };
}

export function useServerVersion() {
  const { settings } = useAppSettings();

  return useQuery({
    queryKey: ["serverVersion", settings.address],
    queryFn: async () => {
      const response = await fetch(`${settings.address}/api/version`, {
        headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch server version: ${response.status}`);
      }

      const data = await response.json();
      return data.version as string;
    },
    enabled: !!settings.address,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

/**
 * Hook to determine the appropriate archived filter value based on user settings.
 * Returns `false` to hide archived bookmarks, or `undefined` to show all bookmarks.
 */
export function useArchiveFilter(): boolean | undefined {
  const { data: userSettings } = api.users.settings.useQuery();
  return userSettings?.archiveDisplayBehaviour === "show" ? undefined : false;
}
