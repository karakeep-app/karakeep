import { useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { create } from "zustand";

import { zReaderFontFamilySchema } from "@karakeep/shared/types/users";

const SETTING_NAME = "settings";

const zToolbarActionId = z.enum([
  "lists",
  "tags",
  "info",
  "favourite",
  "archive",
  "browser",
  "share",
  "delete",
]);

export type ToolbarActionId = z.infer<typeof zToolbarActionId>;

export const DEFAULT_TOOLBAR_ACTIONS: ToolbarActionId[] = [
  "lists",
  "tags",
  "info",
  "favourite",
  "share",
  "browser",
];

export const DEFAULT_OVERFLOW_ACTIONS: ToolbarActionId[] = [
  "archive",
  "delete",
];

const zSettingsSchema = z.object({
  apiKey: z.string().optional(),
  apiKeyId: z.string().optional(),
  address: z.string().optional().default("https://cloud.karakeep.app"),
  imageQuality: z.number().optional().default(0.2),
  theme: z.enum(["light", "dark", "system"]).optional().default("system"),
  defaultBookmarkView: z
    .enum(["reader", "browser"])
    .optional()
    .default("reader"),
  showNotes: z.boolean().optional().default(false),
  customHeaders: z.record(z.string(), z.string()).optional().default({}),
  // Reader settings (local device overrides)
  readerFontSize: z.number().int().min(12).max(24).optional(),
  readerLineHeight: z.number().min(1.2).max(2.5).optional(),
  readerFontFamily: zReaderFontFamilySchema.optional(),
  // Toolbar customization
  toolbarActions: z
    .array(zToolbarActionId)
    .optional()
    .default(DEFAULT_TOOLBAR_ACTIONS),
  overflowActions: z
    .array(zToolbarActionId)
    .optional()
    .default(DEFAULT_OVERFLOW_ACTIONS),
});

export type Settings = z.infer<typeof zSettingsSchema>;

interface AppSettingsState {
  settings: { isLoading: boolean; settings: Settings };
  setSettings: (settings: Settings) => Promise<void>;
  load: () => Promise<void>;
}

const useSettings = create<AppSettingsState>((set, get) => ({
  settings: {
    isLoading: true,
    settings: {
      address: "https://cloud.karakeep.app",
      imageQuality: 0.2,
      theme: "system",
      defaultBookmarkView: "reader",
      showNotes: false,
      customHeaders: {},
      toolbarActions: DEFAULT_TOOLBAR_ACTIONS,
      overflowActions: DEFAULT_OVERFLOW_ACTIONS,
    },
  },
  setSettings: async (settings) => {
    await SecureStore.setItemAsync(SETTING_NAME, JSON.stringify(settings));
    set((_state) => ({ settings: { isLoading: false, settings } }));
  },
  load: async () => {
    if (!get().settings.isLoading) {
      return;
    }
    const strVal = await SecureStore.getItemAsync(SETTING_NAME);
    if (!strVal) {
      set((state) => ({
        settings: { isLoading: false, settings: state.settings.settings },
      }));
      return;
    }
    const parsed = zSettingsSchema.safeParse(JSON.parse(strVal));
    if (!parsed.success) {
      // Wipe the state if invalid
      set((state) => ({
        settings: { isLoading: false, settings: state.settings.settings },
      }));
      return;
    }

    // Ensure any new action IDs (added in future updates) appear in overflow
    const knownIds = new Set([
      ...parsed.data.toolbarActions,
      ...parsed.data.overflowActions,
    ]);
    const missing = zToolbarActionId.options.filter((id) => !knownIds.has(id));
    if (missing.length > 0) {
      parsed.data.overflowActions = [
        ...parsed.data.overflowActions,
        ...missing,
      ];
    }

    set((_state) => ({
      settings: { isLoading: false, settings: parsed.data },
    }));
  },
}));

export default function useAppSettings() {
  const { settings, setSettings, load } = useSettings();

  useEffect(() => {
    if (settings.isLoading) {
      load();
    }
  }, [load, settings.isLoading]);

  return { ...settings, setSettings, load };
}

export { useSettings };
