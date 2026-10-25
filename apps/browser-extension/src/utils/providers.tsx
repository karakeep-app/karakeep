import { useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";

import { TRPCSettingsProvider } from "@karakeep/shared-react/providers/trpc-provider";

import usePluginSettings from "./settings";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const { settings, isPending: isInitialized } = usePluginSettings();
  const context = JSON.stringify([
    settings.address,
    settings.apiKey,
    settings.customHeaders,
  ]);
  const [session, setSession] = useState<{
    context: string;
    queryClient: QueryClient;
  } | null>(null);

  useEffect(() => {
    if (!isInitialized || session?.context === context) return;
    // A bookmark route and cached data belong to one server/account only.
    // Unmount the old editors before initializing the new session.
    if (session && window.location.hash.startsWith("#/bookmark/")) {
      window.location.hash = "/";
    }
    setSession({
      context,
      queryClient: new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000 } },
      }),
    });
  }, [isInitialized, context, session]);

  useEffect(() => () => session?.queryClient.clear(), [session]);

  if (!isInitialized || session?.context !== context) {
    return <div role="status">Loading settings...</div>;
  }

  return (
    <TRPCSettingsProvider
      key={context}
      settings={settings}
      queryClient={session.queryClient}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </TRPCSettingsProvider>
  );
}
