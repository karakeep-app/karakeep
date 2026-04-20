import { ReactNode, useCallback } from "react";
import { Platform } from "react-native";

import {
  ReaderSettingsProvider as BaseReaderSettingsProvider,
  useReaderSettingsContext,
} from "@karakeep/shared-react/hooks/reader-settings";
import { ReaderSettingsPartial } from "@karakeep/shared/types/readers";
import { ZReaderFontFamily } from "@karakeep/shared/types/users";

import { useSettings } from "./settings";

// Mobile-specific font families for native Text components
// On Android, use generic font family names: "serif", "sans-serif", "monospace"
// On iOS, use specific font names like "Georgia" and "Courier"
// Note: undefined means use the system default font
export const MOBILE_FONT_FAMILIES: Record<
  ZReaderFontFamily,
  string | undefined
> = Platform.select({
  android: {
    serif: "serif",
    sans: undefined,
    mono: "monospace",
  },
  default: {
    serif: "Georgia",
    sans: undefined,
    mono: "Courier",
  },
})!;

// Font families for WebView HTML content (CSS font stacks)
export const WEBVIEW_FONT_FAMILIES: Record<ZReaderFontFamily, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, Menlo, Monaco, 'Courier New', monospace",
} as const;

/**
 * Mobile-specific provider for reader settings.
 * Wraps the shared provider with mobile storage callbacks.
 */
export function ReaderSettingsProvider({ children }: { children: ReactNode }) {
  // Read from zustand store directly to keep callback stable (empty deps).
  const getLocalOverrides = useCallback((): ReaderSettingsPartial => {
    const currentSettings = useSettings.getState().settings.settings;
    return {
      fontSize: currentSettings.readerFontSize,
      lineHeight: currentSettings.readerLineHeight,
      fontFamily: currentSettings.readerFontFamily,
    };
  }, []);

  const saveLocalOverrides = useCallback((overrides: ReaderSettingsPartial) => {
    const currentSettings = useSettings.getState().settings.settings;
    // Remove reader settings keys first, then add back only defined ones
    const {
      readerFontSize: _fs,
      readerLineHeight: _lh,
      readerFontFamily: _ff,
      ...rest
    } = currentSettings;

    const newSettings = { ...rest };
    if (overrides.fontSize !== undefined) {
      (newSettings as typeof currentSettings).readerFontSize =
        overrides.fontSize;
    }
    if (overrides.lineHeight !== undefined) {
      (newSettings as typeof currentSettings).readerLineHeight =
        overrides.lineHeight;
    }
    if (overrides.fontFamily !== undefined) {
      (newSettings as typeof currentSettings).readerFontFamily =
        overrides.fontFamily;
    }

    useSettings.getState().setSettings(newSettings);
  }, []);

  return (
    <BaseReaderSettingsProvider
      getLocalOverrides={getLocalOverrides}
      saveLocalOverrides={saveLocalOverrides}
    >
      {children}
    </BaseReaderSettingsProvider>
  );
}

// Re-export the context hook as useReaderSettings for mobile consumers
export { useReaderSettingsContext as useReaderSettings };
