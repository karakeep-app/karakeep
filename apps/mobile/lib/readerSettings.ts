import { useCallback, useMemo } from "react";

import {
  READER_DEFAULTS,
  ReaderSettings,
  ReaderSettingsPartial,
} from "@karakeep/shared/types/readers";
import { ZReaderFontFamily } from "@karakeep/shared/types/users";

import useAppSettings from "./settings";
import { api } from "./trpc";

// Mobile-specific font families - React Native only accepts single font names
// These are system fonts available on iOS/Android
export const MOBILE_FONT_FAMILIES: Record<ZReaderFontFamily, string> = {
  serif: "Georgia",
  sans: "System", // Uses the system default sans-serif font
  mono: "Courier",
} as const;

// Font families for WebView HTML content (can use CSS font stacks)
export const WEBVIEW_FONT_FAMILIES: Record<ZReaderFontFamily, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, Menlo, Monaco, 'Courier New', monospace",
} as const;

export function useReaderSettings() {
  const { settings: localSettings, setSettings } = useAppSettings();
  const { data: serverSettings } = api.users.settings.useQuery();
  const { mutate: updateServerSettings } =
    api.users.updateSettings.useMutation();

  // Compute effective settings with precedence: local → server → default
  const settings: ReaderSettings = useMemo(
    () => ({
      fontSize:
        localSettings.readerFontSize ??
        serverSettings?.readerFontSize ??
        READER_DEFAULTS.fontSize,
      lineHeight:
        localSettings.readerLineHeight ??
        serverSettings?.readerLineHeight ??
        READER_DEFAULTS.lineHeight,
      fontFamily:
        localSettings.readerFontFamily ??
        serverSettings?.readerFontFamily ??
        READER_DEFAULTS.fontFamily,
    }),
    [
      localSettings.readerFontSize,
      localSettings.readerLineHeight,
      localSettings.readerFontFamily,
      serverSettings?.readerFontSize,
      serverSettings?.readerLineHeight,
      serverSettings?.readerFontFamily,
    ],
  );

  // Get the local override values (for UI indicators)
  const localOverrides: ReaderSettingsPartial = useMemo(
    () => ({
      fontSize: localSettings.readerFontSize,
      lineHeight: localSettings.readerLineHeight,
      fontFamily: localSettings.readerFontFamily,
    }),
    [
      localSettings.readerFontSize,
      localSettings.readerLineHeight,
      localSettings.readerFontFamily,
    ],
  );

  // Get the server setting values (for UI indicators)
  const serverDefaults: ReaderSettingsPartial = useMemo(
    () => ({
      fontSize: serverSettings?.readerFontSize ?? undefined,
      lineHeight: serverSettings?.readerLineHeight ?? undefined,
      fontFamily: serverSettings?.readerFontFamily ?? undefined,
    }),
    [
      serverSettings?.readerFontSize,
      serverSettings?.readerLineHeight,
      serverSettings?.readerFontFamily,
    ],
  );

  // Update local override (per-device, immediate)
  const updateLocal = useCallback(
    (updates: ReaderSettingsPartial) => {
      setSettings({
        ...localSettings,
        readerFontSize: updates.fontSize ?? localSettings.readerFontSize,
        readerLineHeight: updates.lineHeight ?? localSettings.readerLineHeight,
        readerFontFamily: updates.fontFamily ?? localSettings.readerFontFamily,
      });
    },
    [localSettings, setSettings],
  );

  // Clear a specific local override
  const clearLocal = useCallback(
    (key: keyof ReaderSettings) => {
      const keyMap = {
        fontSize: "readerFontSize",
        lineHeight: "readerLineHeight",
        fontFamily: "readerFontFamily",
      } as const;
      const settingKey = keyMap[key];
      // Create a new object without the key
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [settingKey]: _, ...rest } = localSettings;
      setSettings(rest);
    },
    [localSettings, setSettings],
  );

  // Clear all local overrides
  const clearAllLocal = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { readerFontSize, readerLineHeight, readerFontFamily, ...rest } =
      localSettings;
    setSettings(rest);
  }, [localSettings, setSettings]);

  // Save current effective settings as server default (syncs across devices)
  const saveAsDefault = useCallback(
    (settingsToSave?: ReaderSettingsPartial) => {
      const toSave = settingsToSave ?? settings;
      updateServerSettings({
        readerFontSize: toSave.fontSize,
        readerLineHeight: toSave.lineHeight,
        readerFontFamily: toSave.fontFamily,
      });
    },
    [settings, updateServerSettings],
  );

  // Clear a specific server default (set to null)
  const clearDefault = useCallback(
    (key: keyof ReaderSettings) => {
      const serverKeyMap = {
        fontSize: "readerFontSize",
        lineHeight: "readerLineHeight",
        fontFamily: "readerFontFamily",
      } as const;
      updateServerSettings({ [serverKeyMap[key]]: null });
    },
    [updateServerSettings],
  );

  // Clear all server defaults
  const clearAllDefaults = useCallback(() => {
    updateServerSettings({
      readerFontSize: null,
      readerLineHeight: null,
      readerFontFamily: null,
    });
  }, [updateServerSettings]);

  // Check if there are any local overrides
  const hasLocalOverrides =
    localSettings.readerFontSize !== undefined ||
    localSettings.readerLineHeight !== undefined ||
    localSettings.readerFontFamily !== undefined;

  // Check if there are any server defaults
  const hasServerDefaults =
    serverSettings?.readerFontSize != null ||
    serverSettings?.readerLineHeight != null ||
    serverSettings?.readerFontFamily != null;

  return {
    // Current effective settings (what should be displayed)
    settings,

    // Raw values for UI indicators
    localOverrides,
    serverDefaults,

    // Status flags
    hasLocalOverrides,
    hasServerDefaults,

    // Actions
    updateLocal,
    clearLocal,
    clearAllLocal,
    saveAsDefault,
    clearDefault,
    clearAllDefaults,
  };
}
