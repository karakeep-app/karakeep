import { useCallback, useMemo } from "react";
import { Platform } from "react-native";

import { useReaderSettings as useReaderSettingsBase } from "@karakeep/shared-react/hooks/reader-settings";
import { ReaderSettingsPartial } from "@karakeep/shared/types/readers";
import { ZReaderFontFamily } from "@karakeep/shared/types/users";

import useAppSettings from "./settings";

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

export function useReaderSettings() {
  const { settings: localSettings, setSettings } = useAppSettings();

  const getLocalOverrides = useCallback((): ReaderSettingsPartial => {
    return {
      fontSize: localSettings.readerFontSize,
      lineHeight: localSettings.readerLineHeight,
      fontFamily: localSettings.readerFontFamily,
    };
  }, [
    localSettings.readerFontSize,
    localSettings.readerLineHeight,
    localSettings.readerFontFamily,
  ]);

  const saveLocalOverrides = useCallback(
    (overrides: ReaderSettingsPartial) => {
      // Remove reader settings keys first, then add back only defined ones
      const {
        readerFontSize: _fs,
        readerLineHeight: _lh,
        readerFontFamily: _ff,
        ...rest
      } = localSettings;

      const newSettings = { ...rest };
      if (overrides.fontSize !== undefined) {
        (newSettings as typeof localSettings).readerFontSize =
          overrides.fontSize;
      }
      if (overrides.lineHeight !== undefined) {
        (newSettings as typeof localSettings).readerLineHeight =
          overrides.lineHeight;
      }
      if (overrides.fontFamily !== undefined) {
        (newSettings as typeof localSettings).readerFontFamily =
          overrides.fontFamily;
      }

      setSettings(newSettings);
    },
    [localSettings, setSettings],
  );

  // Memoize options to prevent unnecessary re-renders
  const options = useMemo(
    () => ({
      getLocalOverrides,
      saveLocalOverrides,
    }),
    [getLocalOverrides, saveLocalOverrides],
  );

  return useReaderSettingsBase(options);
}
