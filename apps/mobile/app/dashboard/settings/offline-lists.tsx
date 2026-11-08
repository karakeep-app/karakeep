import { useMemo } from "react";
import type { ListPickerOption } from "@/components/lists/list-picker";
import {
  byListPathName,
  ListPicker,
  listPathToPickerOption,
} from "@/components/lists/list-picker";
import QueryPageState from "@/components/QueryPageState";
import { SettingsScreen } from "@/components/settings/settings-list";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import {
  setListKeptOffline,
  useOfflineDownloadPrefs,
} from "@/lib/offlineDownloadPrefs";
import { getOfflineLibraryScope } from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";

export default function OfflineLists() {
  const { settings } = useAppSettings();
  const { t } = useTranslation();
  const scope = getOfflineLibraryScope(settings);
  const prefs = useOfflineDownloadPrefs(scope);
  const { data, error, refetch } = useBookmarkLists();

  const options = useMemo(() => {
    const selected = new Set(prefs.listIds);
    return [...(data?.allPaths ?? [])]
      .sort(byListPathName)
      .map((path): ListPickerOption => {
        const option = listPathToPickerOption(path);
        return {
          ...option,
          state: selected.has(option.id) ? "selected" : undefined,
        };
      });
  }, [data?.allPaths, prefs.listIds]);

  if (!data) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  return (
    <SettingsScreen>
      <Text className="px-1 text-sm text-muted-foreground">
        {t("settings.offline_lists_intro")}
      </Text>
      <ListPicker
        emptyMessage={t("settings.offline_lists_empty")}
        onSelect={(listId) =>
          setListKeptOffline(scope, listId, !prefs.listIds.includes(listId))
        }
        options={options}
      />
    </SettingsScreen>
  );
}
