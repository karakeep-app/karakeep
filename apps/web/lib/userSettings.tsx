"use client";

import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZUserSettings } from "@karakeep/shared/types/users";

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
  tagGranularity: "focused",
  curatedTagIds: null,
  inferredTagLang: null,
});

export function UserSettingsContextProvider({
  userSettings,
  children,
}: {
  userSettings: ZUserSettings;
  children: React.ReactNode;
}) {
  const api = useTRPC();
  const { data } = useQuery(
    api.users.settings.queryOptions(undefined, {
      initialData: userSettings,
    }),
  );

  return (
    <UserSettingsContext.Provider value={data}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  return useContext(UserSettingsContext);
}
