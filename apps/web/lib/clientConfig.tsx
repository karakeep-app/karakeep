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
  turnstile: null,
  inference: {
    isConfigured: false,
    inferredTagLang: "english",
    enableAutoTagging: false,
    enableAutoSummarization: false,
    provider: null,
    textModel: "",
    imageModel: "",
    embeddingProvider: null,
    embeddingModel: "",
  },
  serverVersion: undefined,
  disableNewReleaseCheck: true,
});

export function useClientConfig() {
  return useContext(ClientConfigCtx);
}
