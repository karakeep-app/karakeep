import { createContext, useContext } from "react";

import type { ClientConfig } from "@karakeep/shared/config";

export const ClientConfigCtx = createContext<ClientConfig>({
  publicUrl: "",
  publicApiUrl: "",
  demoMode: undefined,
  auth: {
    disableSignups: false,
    disablePasswordAuth: false,
  },
  inference: {
    isConfigured: false,
    inferredTagLang: "english",
  },
  crawler: {
    storeScreenshot: true,
  },
  serverVersion: undefined,
  disableNewReleaseCheck: true,
});

export function useClientConfig() {
  return useContext(ClientConfigCtx);
}
