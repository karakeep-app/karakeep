import { ImageURISource } from "react-native";

import useAppSettings from "./settings";
import { buildApiHeaders } from "./utils";

export function useAssetUrl(assetId: string): ImageURISource {
  const { settings } = useAppSettings();
  return {
    uri: `${settings.address}/api/assets/${assetId}`,
    headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
  };
}
