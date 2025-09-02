import React from "react";
import { z } from "zod";

export const DEFAULT_BADGE_CACHE_EXPIRE_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_SHOW_COUNT_BADGE = false;

const zSettingsSchema = z.object({
  apiKey: z.string(),
  apiKeyId: z.string().optional(),
  address: z.string(),
  showCountBadge: z.boolean().default(DEFAULT_SHOW_COUNT_BADGE),
  badgeCacheExpireMs: z.number().min(0).default(DEFAULT_BADGE_CACHE_EXPIRE_MS),
});

const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  address: "",
  showCountBadge: DEFAULT_SHOW_COUNT_BADGE,
  badgeCacheExpireMs: DEFAULT_BADGE_CACHE_EXPIRE_MS,
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

  return { settings, setSettings, isPending: isInit };
}

export async function getPluginSettings() {
  const parsedSettings = zSettingsSchema.safeParse(
    (await STORAGE.get("settings")).settings,
  );
  if (parsedSettings.success) {
    return parsedSettings.data;
  } else {
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
