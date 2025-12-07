"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useUpdateUserSettings } from "@karakeep/shared-react/hooks/users";
import {
  READER_DEFAULTS,
  ReaderSettings,
  ReaderSettingsPartial,
} from "@karakeep/shared/types/readers";

import { useUserSettings } from "./userSettings";

const LOCAL_STORAGE_KEY = "karakeep-reader-settings";

function getLocalOverridesFromStorage(): ReaderSettingsPartial {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveLocalOverridesToStorage(overrides: ReaderSettingsPartial): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(overrides));
}

// Session overrides are temporary changes that haven't been saved yet
// They are used for live preview in the reader view
interface ReaderSettingsContextValue {
  sessionOverrides: ReaderSettingsPartial;
  setSessionOverrides: React.Dispatch<
    React.SetStateAction<ReaderSettingsPartial>
  >;
  localOverrides: ReaderSettingsPartial;
  setLocalOverrides: React.Dispatch<
    React.SetStateAction<ReaderSettingsPartial>
  >;
}

const ReaderSettingsContext = createContext<ReaderSettingsContextValue | null>(
  null,
);

export function ReaderSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionOverrides, setSessionOverrides] =
    useState<ReaderSettingsPartial>({});
  const [localOverrides, setLocalOverrides] = useState<ReaderSettingsPartial>(
    {},
  );

  // Load local overrides from storage on mount
  useEffect(() => {
    setLocalOverrides(getLocalOverridesFromStorage());
  }, []);

  const value = useMemo(
    () => ({
      sessionOverrides,
      setSessionOverrides,
      localOverrides,
      setLocalOverrides,
    }),
    [sessionOverrides, localOverrides],
  );

  return (
    <ReaderSettingsContext.Provider value={value}>
      {children}
    </ReaderSettingsContext.Provider>
  );
}

export function useReaderSettings() {
  const context = useContext(ReaderSettingsContext);
  if (!context) {
    throw new Error(
      "useReaderSettings must be used within a ReaderSettingsProvider",
    );
  }

  const {
    sessionOverrides,
    setSessionOverrides,
    localOverrides,
    setLocalOverrides,
  } = context;
  const serverSettings = useUserSettings();
  const { mutate: updateServerSettings } = useUpdateUserSettings();

  // Compute effective settings with precedence: session → local → server → default
  const effectiveSettings: ReaderSettings = useMemo(
    () => ({
      fontSize:
        sessionOverrides.fontSize ??
        localOverrides.fontSize ??
        serverSettings.readerFontSize ??
        READER_DEFAULTS.fontSize,
      lineHeight:
        sessionOverrides.lineHeight ??
        localOverrides.lineHeight ??
        serverSettings.readerLineHeight ??
        READER_DEFAULTS.lineHeight,
      fontFamily:
        sessionOverrides.fontFamily ??
        localOverrides.fontFamily ??
        serverSettings.readerFontFamily ??
        READER_DEFAULTS.fontFamily,
    }),
    [sessionOverrides, localOverrides, serverSettings],
  );

  // Update session override (live preview, not persisted)
  const updateSession = useCallback(
    (updates: ReaderSettingsPartial) => {
      setSessionOverrides((prev) => ({ ...prev, ...updates }));
    },
    [setSessionOverrides],
  );

  // Clear all session overrides
  const clearSession = useCallback(() => {
    setSessionOverrides({});
  }, [setSessionOverrides]);

  // Save current settings to local storage (this device only)
  const saveToDevice = useCallback(() => {
    const newLocalOverrides = { ...localOverrides, ...sessionOverrides };
    setLocalOverrides(newLocalOverrides);
    saveLocalOverridesToStorage(newLocalOverrides);
    setSessionOverrides({});
  }, [
    localOverrides,
    sessionOverrides,
    setLocalOverrides,
    setSessionOverrides,
  ]);

  // Clear all local overrides (revert to server/default)
  const clearLocalOverrides = useCallback(() => {
    setLocalOverrides({});
    saveLocalOverridesToStorage({});
  }, [setLocalOverrides]);

  // Clear a single local override
  const clearLocalOverride = useCallback(
    (key: keyof ReaderSettings) => {
      setLocalOverrides((prev) => {
        const { [key]: _, ...rest } = prev;
        saveLocalOverridesToStorage(rest);
        return rest;
      });
    },
    [setLocalOverrides],
  );

  // Save current effective settings to server (all devices)
  const saveToServer = useCallback(() => {
    updateServerSettings({
      readerFontSize: effectiveSettings.fontSize,
      readerLineHeight: effectiveSettings.lineHeight,
      readerFontFamily: effectiveSettings.fontFamily,
    });
    // Clear session and local overrides since server now has these values
    setSessionOverrides({});
    setLocalOverrides({});
    saveLocalOverridesToStorage({});
  }, [
    effectiveSettings,
    updateServerSettings,
    setSessionOverrides,
    setLocalOverrides,
  ]);

  // Clear all server defaults (set to null)
  const clearServerDefaults = useCallback(() => {
    updateServerSettings({
      readerFontSize: null,
      readerLineHeight: null,
      readerFontFamily: null,
    });
  }, [updateServerSettings]);

  // Check if there are unsaved session changes
  const hasSessionChanges = Object.keys(sessionOverrides).length > 0;

  // Check if there are local overrides
  const hasLocalOverrides = Object.keys(localOverrides).length > 0;

  return {
    // Current effective settings (what should be displayed)
    settings: effectiveSettings,

    // Raw values for UI indicators
    serverSettings: {
      fontSize: serverSettings.readerFontSize,
      lineHeight: serverSettings.readerLineHeight,
      fontFamily: serverSettings.readerFontFamily,
    },
    localOverrides,
    sessionOverrides,

    // State indicators
    hasSessionChanges,
    hasLocalOverrides,

    // Actions
    updateSession,
    clearSession,
    saveToDevice,
    clearLocalOverrides,
    clearLocalOverride,
    saveToServer,
    clearServerDefaults,
  };
}
