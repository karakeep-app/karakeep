import { useEffect } from "react";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { ToastProvider } from "@/components/ui/Toast";

import { TRPCProvider } from "@karakeep/shared-react/providers/trpc-provider";

import { ReaderSettingsProvider } from "./readerSettings";
import useAppSettings from "./settings";

export function Providers({ children }: { children: React.ReactNode }) {
  const { settings, isLoading, load } = useAppSettings();

  useEffect(() => {
    load();
  }, []);

  if (isLoading) {
    // Don't render anything if the settings still hasn't been loaded
    return <FullPageSpinner />;
  }

  return (
    <TRPCProvider settings={settings}>
      <ReaderSettingsProvider>
        <ToastProvider>{children}</ToastProvider>
      </ReaderSettingsProvider>
    </TRPCProvider>
  );
}
