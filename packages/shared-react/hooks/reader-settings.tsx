"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  READER_DEFAULTS,
  ReaderSettings,
  ReaderSettingsPartial,
} from "@karakeep/shared/types/readers";

import { api } from "../trpc";

export interface UseReaderSettingsOptions {
  /**
   * Get local overrides (device-specific settings stored locally)
   */
  getLocalOverrides: () => ReaderSettingsPartial;
  /**
   * Save local overrides to local storage
   */
  saveLocalOverrides: (overrides: ReaderSettingsPartial) => void;
  /**
   * Optional session overrides (for live preview in web).
   * If provided, these take highest precedence.
   */
  sessionOverrides?: ReaderSettingsPartial;
  /**
   * Callback when session overrides should be cleared (after successful server save)
   */
  onClearSessionOverrides?: () => void;
}

export function useReaderSettings(options: UseReaderSettingsOptions) {
  const {
    getLocalOverrides,
    saveLocalOverrides,
    sessionOverrides = {},
    onClearSessionOverrides,
  } = options;

  const [localOverrides, setLocalOverrides] = useState<ReaderSettingsPartial>(
    {},
  );
  const [pendingServerSave, setPendingServerSave] =
    useState<ReaderSettings | null>(null);

  const { data: serverSettings } = api.users.settings.useQuery();
  const apiUtils = api.useUtils();

  // Load local overrides on mount
  useEffect(() => {
    setLocalOverrides(getLocalOverrides());
  }, [getLocalOverrides]);

  // Clear pending state when server settings match what we saved
  useEffect(() => {
    if (pendingServerSave && serverSettings) {
      const serverMatches =
        serverSettings.readerFontSize === pendingServerSave.fontSize &&
        // Tolerate minor float normalization differences for lineHeight
        Math.abs(
          (serverSettings.readerLineHeight ?? 0) - pendingServerSave.lineHeight,
        ) < 1e-6 &&
        serverSettings.readerFontFamily === pendingServerSave.fontFamily;
      if (serverMatches) {
        setPendingServerSave(null);
      }
    }
  }, [serverSettings, pendingServerSave]);

  const { mutate: updateServerSettings, isPending: isSaving } =
    api.users.updateSettings.useMutation({
      onSettled: async () => {
        await apiUtils.users.settings.refetch();
      },
    });

  // Separate mutation for saving defaults (clears local overrides on success)
  const { mutate: saveServerSettings, isPending: isSavingDefaults } =
    api.users.updateSettings.useMutation({
      onSuccess: () => {
        // Clear local and session overrides after successful server save
        setLocalOverrides({});
        saveLocalOverrides({});
        onClearSessionOverrides?.();
      },
      onError: () => {
        // Clear pending state so we don't show values that failed to persist
        setPendingServerSave(null);
      },
      onSettled: async () => {
        await apiUtils.users.settings.refetch();
      },
    });

  // Compute effective settings with precedence: session → local → pendingSave → server → default
  const settings: ReaderSettings = useMemo(
    () => ({
      fontSize:
        sessionOverrides.fontSize ??
        localOverrides.fontSize ??
        pendingServerSave?.fontSize ??
        serverSettings?.readerFontSize ??
        READER_DEFAULTS.fontSize,
      lineHeight:
        sessionOverrides.lineHeight ??
        localOverrides.lineHeight ??
        pendingServerSave?.lineHeight ??
        serverSettings?.readerLineHeight ??
        READER_DEFAULTS.lineHeight,
      fontFamily:
        sessionOverrides.fontFamily ??
        localOverrides.fontFamily ??
        pendingServerSave?.fontFamily ??
        serverSettings?.readerFontFamily ??
        READER_DEFAULTS.fontFamily,
    }),
    [sessionOverrides, localOverrides, pendingServerSave, serverSettings],
  );

  // Get the server setting values (for UI indicators)
  const serverDefaults: ReaderSettingsPartial = useMemo(
    () => ({
      fontSize: serverSettings?.readerFontSize ?? undefined,
      lineHeight: serverSettings?.readerLineHeight ?? undefined,
      fontFamily: serverSettings?.readerFontFamily ?? undefined,
    }),
    [serverSettings],
  );

  // Update local override (per-device, immediate)
  const updateLocal = useCallback(
    (updates: ReaderSettingsPartial) => {
      setLocalOverrides((prev) => {
        const newOverrides = { ...prev, ...updates };
        saveLocalOverrides(newOverrides);
        return newOverrides;
      });
    },
    [saveLocalOverrides],
  );

  // Clear a specific local override
  const clearLocal = useCallback(
    (key: keyof ReaderSettings) => {
      setLocalOverrides((prev) => {
        const { [key]: _, ...rest } = prev;
        saveLocalOverrides(rest);
        return rest;
      });
    },
    [saveLocalOverrides],
  );

  // Clear all local overrides
  const clearAllLocal = useCallback(() => {
    setLocalOverrides({});
    saveLocalOverrides({});
  }, [saveLocalOverrides]);

  // Save current effective settings as server default (syncs across devices)
  const saveAsDefault = useCallback(
    (settingsToSave?: ReaderSettingsPartial) => {
      const toSave: ReaderSettings = {
        fontSize: settingsToSave?.fontSize ?? settings.fontSize,
        lineHeight: settingsToSave?.lineHeight ?? settings.lineHeight,
        fontFamily: settingsToSave?.fontFamily ?? settings.fontFamily,
      };
      // Set pending state to prevent flicker while server syncs
      setPendingServerSave(toSave);
      saveServerSettings({
        readerFontSize: toSave.fontSize,
        readerLineHeight: toSave.lineHeight,
        readerFontFamily: toSave.fontFamily,
      });
    },
    [settings, saveServerSettings],
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
  const hasLocalOverrides = Object.keys(localOverrides).length > 0;

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
    isSaving: isSaving || isSavingDefaults,

    // Internal state setters (for web's context-based approach)
    setLocalOverrides,

    // Actions
    updateLocal,
    clearLocal,
    clearAllLocal,
    saveAsDefault,
    clearDefault,
    clearAllDefaults,
  };
}

// Context for sharing reader settings state across components
export type ReaderSettingsContextValue = ReturnType<typeof useReaderSettings>;

const ReaderSettingsContext = createContext<ReaderSettingsContextValue | null>(
  null,
);

export interface ReaderSettingsProviderProps extends UseReaderSettingsOptions {
  children: ReactNode;
}

/**
 * Provider that creates a single instance of reader settings state
 * and shares it across all child components.
 */
export function ReaderSettingsProvider({
  children,
  ...options
}: ReaderSettingsProviderProps) {
  const value = useReaderSettings(options);

  return (
    <ReaderSettingsContext.Provider value={value}>
      {children}
    </ReaderSettingsContext.Provider>
  );
}

/**
 * Hook to access shared reader settings from context.
 * Must be used within a ReaderSettingsProvider.
 */
export function useReaderSettingsContext() {
  const context = useContext(ReaderSettingsContext);
  if (!context) {
    throw new Error(
      "useReaderSettingsContext must be used within a ReaderSettingsProvider",
    );
  }
  return context;
}
