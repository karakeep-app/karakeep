import React from "react";
import { z } from "zod";

const zSettingsSchema = z.object({
  apiKey: z.string(),
  apiKeyId: z.string().optional(),
  address: z.string(),
  autoSave: z.boolean(),
});

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  address: "",
  autoSave: true, // Default to auto-save enabled for existing users
};

export type Settings = z.infer<typeof zSettingsSchema>;

const STORAGE = chrome.storage.sync;

export default function usePluginSettings() {
  const [settings, setSettingsInternal] =
    React.useState<Settings>(DEFAULT_SETTINGS);

  const [isInit, setIsInit] = React.useState(false);

  React.useEffect(() => {
    if (!isInit) {
      getPluginSettings().then((settings) => {
        setSettingsInternal(settings);
        setIsInit(true);
      });
    }
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (changes.settings === undefined) {
        return;
      }
      const parsedSettings = zSettingsSchema.safeParse(
        changes.settings.newValue,
      );
      if (parsedSettings.success) {
        setSettingsInternal(parsedSettings.data);
      }
    };
    STORAGE.onChanged.addListener(onChange);
    return () => {
      STORAGE.onChanged.removeListener(onChange);
    };
  }, []);

  const setSettings = async (s: (_: Settings) => Settings) => {
    const newVal = s(settings);
    await STORAGE.set({ settings: newVal });
  };

  return { settings, setSettings, isPending: !isInit };
}

export async function getPluginSettings() {
  const storedSettings = (await STORAGE.get("settings")).settings;
  const parsedSettings = zSettingsSchema.safeParse(storedSettings);

  if (parsedSettings.success) {
    return parsedSettings.data;
  } else {
    // If settings exist but are missing the autoSave field (for existing users),
    // merge with defaults to ensure autoSave is set
    if (storedSettings && typeof storedSettings === "object") {
      const mergedSettings = { ...DEFAULT_SETTINGS, ...storedSettings };
      // Try to parse the merged settings
      const mergedParsed = zSettingsSchema.safeParse(mergedSettings);
      if (mergedParsed.success) {
        // Save the merged settings back to storage for future use
        await STORAGE.set({ settings: mergedSettings });
        return mergedParsed.data;
      }
    }
    return DEFAULT_SETTINGS;
  }
}

export function subscribeToSettingsChanges(
  callback: (settings: Settings) => void,
) {
  STORAGE.onChanged.addListener((changes) => {
    if (changes.settings === undefined) {
      return;
    }
    const parsedSettings = zSettingsSchema.safeParse(changes.settings.newValue);
    if (parsedSettings.success) {
      callback(parsedSettings.data);
    } else {
      callback(DEFAULT_SETTINGS);
    }
  });
}
