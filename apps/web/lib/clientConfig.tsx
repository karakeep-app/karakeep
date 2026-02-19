import { createContext, useContext } from "react";

import type { ClientConfig } from "@karakeep/shared/config";

export const ClientConfigCtx = createContext<ClientConfig>({
  publicUrl: "",
  publicApiUrl: "",
  demoMode: undefined,
  auth: {
    disableSignups: false,
    disablePasswordAuth: false,
    oauthAutoRedirect: false,
  },
  turnstile: null,
  inference: {
    isConfigured: false,
    inferredTagLang: "english",
    enableAutoTagging: false,
    enableAutoSummarization: false,
  },
  legal: {
    termsOfServiceUrl: undefined,
    privacyPolicyUrl: undefined,
  },
  serverVersion: undefined,
  disableNewReleaseCheck: true,
});

export function useClientConfig() {
  return useContext(ClientConfigCtx);
}
