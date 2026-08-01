import { createContext, use, useMemo } from "react";

import type { ZClientConfig } from "@karakeep/shared/types/config";

export const DEFAULT_CLIENT_CONFIG: ZClientConfig = {
  publicUrl: "",
  publicApiUrl: "",
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
  chat: {
    enabled: false,
  },
  search: {
    semanticSearchEnabled: false,
  },
  stripe: {
    isConfigured: false,
  },
  legal: {},
  disableNewReleaseCheck: true,
};

const ClientConfigContext = createContext<ZClientConfig>(DEFAULT_CLIENT_CONFIG);

export function ClientConfigProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value?: ZClientConfig;
}) {
  // Merge every nested group so an older server can omit newly introduced
  // capabilities without breaking a newer client.
  const config = useMemo<ZClientConfig>(
    () => ({
      ...DEFAULT_CLIENT_CONFIG,
      ...value,
      auth: {
        ...DEFAULT_CLIENT_CONFIG.auth,
        ...value?.auth,
      },
      inference: {
        ...DEFAULT_CLIENT_CONFIG.inference,
        ...value?.inference,
      },
      chat: {
        ...DEFAULT_CLIENT_CONFIG.chat,
        ...value?.chat,
      },
      search: {
        ...DEFAULT_CLIENT_CONFIG.search,
        ...value?.search,
      },
      stripe: {
        ...DEFAULT_CLIENT_CONFIG.stripe,
        ...value?.stripe,
      },
      legal: {
        ...DEFAULT_CLIENT_CONFIG.legal,
        ...value?.legal,
      },
    }),
    [value],
  );

  return (
    <ClientConfigContext.Provider value={config}>
      {children}
    </ClientConfigContext.Provider>
  );
}

export function useClientConfig() {
  return use(ClientConfigContext);
}
