import { useEffect } from "react";
import { Alert, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsScreen,
  SettingsSeparator,
} from "@/components/settings/settings-list";
import EmptyState from "@/components/ui/EmptyState";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { clearPersistedCache, usePersistedCacheSize } from "@/lib/offlineCache";
import {
  getOfflineLibraryScope,
  reconcileOfflineLibrary,
  removeAllOfflineArticles,
  removeOfflineArticle,
  useOfflineLibrary,
  useOfflineLibrarySize,
} from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import { useCommonActions, useTranslation } from "@/lib/i18n/hooks";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { getDateFnsLocale, getIntlLocale } from "@/lib/i18n";
import { BookOpen, Trash2 } from "lucide-react-native";

function getStorageSizeFormatter() {
  return new Intl.NumberFormat(getIntlLocale(), {
    maximumFractionDigits: 1,
  });
}

function formatStorageSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${getStorageSizeFormatter().format(value)} ${units[unitIndex]}`;
}

function CacheSectionHeader({ title, size }: { title: string; size: number }) {
  return (
    <View className="flex-row items-center justify-between px-1 pb-2">
      <Text className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </Text>
      <Text className="text-xs tabular-nums text-muted-foreground">
        {formatStorageSize(size)}
      </Text>
    </View>
  );
}

export default function OfflineContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { t } = useTranslation();
  const actions = useCommonActions();
  const { colors } = useColorScheme();
  const scope = getOfflineLibraryScope(settings);
  const offlineLibrary = useOfflineLibrary(scope);
  const offlineLibrarySize = useOfflineLibrarySize();
  const recentCacheSize = usePersistedCacheSize();

  useEffect(() => {
    reconcileOfflineLibrary(scope);
  }, [scope]);

  const confirmRemove = (bookmarkId: string, displayTitle: string) => {
    Alert.alert(
      t("settings.offline_remove_title"),
      t("settings.offline_remove_message", { title: displayTitle }),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: actions.remove,
          style: "destructive",
          onPress: () => removeOfflineArticle(scope, bookmarkId),
        },
      ],
    );
  };

  const confirmRemoveAll = () => {
    Alert.alert(
      t("settings.offline_remove_all_title"),
      t("settings.offline_remove_all_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("settings.offline_remove_all_confirm"),
          style: "destructive",
          onPress: () => removeAllOfflineArticles(scope),
        },
      ],
    );
  };

  const confirmClearRecentCache = () => {
    Alert.alert(
      t("settings.offline_clear_title"),
      t("settings.offline_clear_message"),
      [
        { text: actions.cancel, style: "cancel" },
        {
          text: t("settings.offline_clear_confirm"),
          style: "destructive",
          onPress: () => {
            queryClient.clear();
            clearPersistedCache();
            toast({ message: t("settings.offline_cleared") });
          },
        },
      ],
    );
  };

  return (
    <SettingsScreen>
      <Text className="px-1 text-sm text-muted-foreground">
        {t("settings.offline_intro")}
      </Text>

      <View className="gap-4">
        <View className="gap-2">
          <CacheSectionHeader
            title={t("settings.offline_saved")}
            size={offlineLibrarySize}
          />

          {offlineLibrary.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={t("settings.offline_empty_title")}
              subtitle={t("settings.offline_empty_subtitle")}
            />
          ) : (
            <SettingsGroup>
              {offlineLibrary.map((item, index) => (
                <View key={item.bookmarkId}>
                  {index > 0 ? <SettingsSeparator /> : null}
                  <View className="flex-row items-center px-4 py-3">
                    <Pressable
                      className="min-w-0 flex-1"
                      onPress={() =>
                        router.push(`/dashboard/bookmarks/${item.bookmarkId}`)
                      }
                    >
                      <Text className="font-medium" numberOfLines={2}>
                        {item.displayTitle}
                      </Text>
                      {item.url ? (
                        <Text
                          className="mt-0.5 text-xs text-muted-foreground"
                          numberOfLines={1}
                        >
                          {item.url}
                        </Text>
                      ) : null}
                      <Text className="mt-1 text-xs text-muted-foreground">
                        {t("settings.offline_saved_ago", {
                          ago: formatDistanceToNow(item.savedAt, {
                            addSuffix: true,
                            locale: getDateFnsLocale(),
                          }),
                        })}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={t("settings.offline_remove_label", {
                        title: item.displayTitle,
                      })}
                      className="ml-3 p-2"
                      onPress={() =>
                        confirmRemove(item.bookmarkId, item.displayTitle)
                      }
                    >
                      <Trash2 size={18} color={colors.destructive} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </SettingsGroup>
          )}
        </View>

        {offlineLibrary.length > 0 ? (
          <SettingsGroup>
            <SettingsActionRow
              centered
              label={t("settings.offline_remove_all")}
              onPress={confirmRemoveAll}
            />
          </SettingsGroup>
        ) : null}
      </View>

      <View className="gap-2">
        <CacheSectionHeader
          title={t("settings.offline_recent")}
          size={recentCacheSize}
        />
        <SettingsGroup>
          <SettingsActionRow
            centered
            label={t("settings.offline_clear_recent")}
            onPress={confirmClearRecentCache}
          />
        </SettingsGroup>
      </View>
    </SettingsScreen>
  );
}
