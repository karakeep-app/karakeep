import { ImageURISource } from "react-native";

import useAppSettings from "./settings";

export function useAssetUrl(assetId: string): ImageURISource {
  const { settings } = useAppSettings();
  return {
    uri: `${settings.address}/api/assets/${assetId}`,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
    },
  };
}
