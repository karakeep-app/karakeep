"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  ReaderSettingsProvider as BaseReaderSettingsProvider,
  useReaderSettingsContext,
} from "@karakeep/shared-react/hooks/reader-settings";
import {
  ReaderSettings,
  ReaderSettingsPartial,
} from "@karakeep/shared/types/readers";

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

// Session overrides context - web-specific feature for live preview
interface SessionOverridesContextValue {
  sessionOverrides: ReaderSettingsPartial;
  setSessionOverrides: React.Dispatch<
    React.SetStateAction<ReaderSettingsPartial>
  >;
}

const SessionOverridesContext =
  createContext<SessionOverridesContextValue | null>(null);

export function ReaderSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sessionOverrides, setSessionOverrides] =
    useState<ReaderSettingsPartial>({});

  const sessionValue = useMemo(
    () => ({
      sessionOverrides,
      setSessionOverrides,
    }),
    [sessionOverrides],
  );

  // Memoize callbacks to prevent unnecessary re-renders
  const getLocalOverrides = useCallback(getLocalOverridesFromStorage, []);
  const saveLocalOverrides = useCallback(saveLocalOverridesToStorage, []);
  const onClearSessionOverrides = useCallback(() => {
    setSessionOverrides({});
  }, []);

  return (
    <BaseReaderSettingsProvider
      getLocalOverrides={getLocalOverrides}
      saveLocalOverrides={saveLocalOverrides}
      sessionOverrides={sessionOverrides}
      onClearSessionOverrides={onClearSessionOverrides}
    >
      <SessionOverridesContext.Provider value={sessionValue}>
        {children}
      </SessionOverridesContext.Provider>
    </BaseReaderSettingsProvider>
  );
}

export function useReaderSettings() {
  const sessionContext = useContext(SessionOverridesContext);
  if (!sessionContext) {
    throw new Error(
      "useReaderSettings must be used within a ReaderSettingsProvider",
    );
  }

  const { sessionOverrides, setSessionOverrides } = sessionContext;
  const baseSettings = useReaderSettingsContext();

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
    const newLocalOverrides = {
      ...baseSettings.localOverrides,
      ...sessionOverrides,
    };
    baseSettings.setLocalOverrides(newLocalOverrides);
    saveLocalOverridesToStorage(newLocalOverrides);
    setSessionOverrides({});
  }, [baseSettings, sessionOverrides, setSessionOverrides]);

  // Clear a single local override
  const clearLocalOverride = useCallback(
    (key: keyof ReaderSettings) => {
      baseSettings.clearLocal(key);
    },
    [baseSettings],
  );

  // Check if there are unsaved session changes
  const hasSessionChanges = Object.keys(sessionOverrides).length > 0;

  return {
    // Current effective settings (what should be displayed)
    settings: baseSettings.settings,

    // Raw values for UI indicators
    serverSettings: baseSettings.serverDefaults,
    localOverrides: baseSettings.localOverrides,
    sessionOverrides,

    // State indicators
    hasSessionChanges,
    hasLocalOverrides: baseSettings.hasLocalOverrides,
    isSaving: baseSettings.isSaving,

    // Actions
    updateSession,
    clearSession,
    saveToDevice,
    clearLocalOverrides: baseSettings.clearAllLocal,
    clearLocalOverride,
    saveToServer: baseSettings.saveAsDefault,
    updateServerSetting: baseSettings.saveAsDefault,
    clearServerDefaults: baseSettings.clearAllDefaults,
  };
}
