import { useMemo } from "react";

import { TRPCSettingsProvider } from "@karakeep/shared-react/providers/trpc-provider";

import { getBrowserSessionCredentials } from "./browserSession";
import usePluginSettings from "./settings";
import { ThemeProvider } from "./ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  const { settings } = usePluginSettings();

  const trpcSettings = useMemo(
    () => ({
      ...settings,
      credentials: getBrowserSessionCredentials(settings),
    }),
    [settings],
  );

  return (
    <TRPCSettingsProvider settings={trpcSettings}>
      <ThemeProvider>{children}</ThemeProvider>
    </TRPCSettingsProvider>
  );
}
