"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "@karakeep/shared-react/trpc";
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
  pendingServerSave: ReaderSettings | null;
  setPendingServerSave: React.Dispatch<
    React.SetStateAction<ReaderSettings | null>
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
  const [pendingServerSave, setPendingServerSave] =
    useState<ReaderSettings | null>(null);

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
      pendingServerSave,
      setPendingServerSave,
    }),
    [sessionOverrides, localOverrides, pendingServerSave],
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
    pendingServerSave,
    setPendingServerSave,
  } = context;
  const serverSettings = useUserSettings();

  // Clear pending state only when server settings match what we saved
  useEffect(() => {
    if (pendingServerSave) {
      const serverMatches =
        serverSettings.readerFontSize === pendingServerSave.fontSize &&
        serverSettings.readerLineHeight === pendingServerSave.lineHeight &&
        serverSettings.readerFontFamily === pendingServerSave.fontFamily;
      if (serverMatches) {
        setPendingServerSave(null);
      }
    }
  }, [serverSettings, pendingServerSave]);

  const apiUtils = api.useUtils();
  const { mutate: updateServerSettings, isPending: isSaving } =
    api.users.updateSettings.useMutation({
      onSuccess: () => {
        // Clear session and local overrides only after successful server save
        setSessionOverrides({});
        setLocalOverrides({});
        saveLocalOverridesToStorage({});
      },
      onSettled: () => {
        apiUtils.users.settings.invalidate();
      },
    });

  // Compute effective settings with precedence: session → local → pendingSave → server → default
  const effectiveSettings: ReaderSettings = useMemo(
    () => ({
      fontSize:
        sessionOverrides.fontSize ??
        localOverrides.fontSize ??
        pendingServerSave?.fontSize ??
        serverSettings.readerFontSize ??
        READER_DEFAULTS.fontSize,
      lineHeight:
        sessionOverrides.lineHeight ??
        localOverrides.lineHeight ??
        pendingServerSave?.lineHeight ??
        serverSettings.readerLineHeight ??
        READER_DEFAULTS.lineHeight,
      fontFamily:
        sessionOverrides.fontFamily ??
        localOverrides.fontFamily ??
        pendingServerSave?.fontFamily ??
        serverSettings.readerFontFamily ??
        READER_DEFAULTS.fontFamily,
    }),
    [sessionOverrides, localOverrides, pendingServerSave, serverSettings],
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
    const settingsToSave = { ...effectiveSettings };
    // Set pending state to prevent flicker while server syncs
    setPendingServerSave(settingsToSave);
    updateServerSettings({
      readerFontSize: settingsToSave.fontSize,
      readerLineHeight: settingsToSave.lineHeight,
      readerFontFamily: settingsToSave.fontFamily,
    });
    // Note: Session and local overrides are cleared in onSuccess callback
  }, [effectiveSettings, updateServerSettings, setPendingServerSave]);

  // Clear all server defaults (set to null)
  const clearServerDefaults = useCallback(() => {
    updateServerSettings({
      readerFontSize: null,
      readerLineHeight: null,
      readerFontFamily: null,
    });
  }, [updateServerSettings]);

  // Update a single server setting (for settings page direct edits)
  const updateServerSetting = useCallback(
    (updates: ReaderSettingsPartial) => {
      // Merge with current effective settings for pending state
      const newSettings: ReaderSettings = {
        ...effectiveSettings,
        ...updates,
      };
      setPendingServerSave(newSettings);
      updateServerSettings({
        readerFontSize: updates.fontSize,
        readerLineHeight: updates.lineHeight,
        readerFontFamily: updates.fontFamily,
      });
    },
    [effectiveSettings, updateServerSettings, setPendingServerSave],
  );

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
    isSaving,

    // Actions
    updateSession,
    clearSession,
    saveToDevice,
    clearLocalOverrides,
    clearLocalOverride,
    saveToServer,
    updateServerSetting,
    clearServerDefaults,
  };
}
