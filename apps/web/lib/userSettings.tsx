"use client";

import { createContext, useContext } from "react";

import { ZUserSettings } from "@karakeep/shared/types/users";

import { api } from "./trpc";

export const UserSettingsContext = createContext<ZUserSettings>({
  bookmarkClickAction: "open_original_link",
  archiveDisplayBehaviour: "show",
  timezone: "UTC",
  backupsEnabled: false,
  backupsFrequency: "daily",
  backupsRetentionDays: 7,
  readerFontSize: null,
  readerLineHeight: null,
  readerFontFamily: null,
  autoTaggingEnabled: null,
  autoSummarizationEnabled: null,
  tagStyle: "as-generated",
  inferredTagLang: null,
});

export function UserSettingsContextProvider({
  userSettings,
  children,
}: {
  userSettings: ZUserSettings;
  children: React.ReactNode;
}) {
  const { data } = api.users.settings.useQuery(undefined, {
    initialData: userSettings,
  });

  return (
    <UserSettingsContext.Provider value={data}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  return useContext(UserSettingsContext);
}
