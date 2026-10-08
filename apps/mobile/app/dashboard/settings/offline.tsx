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
import { useColorScheme } from "@/lib/useColorScheme";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Trash2 } from "lucide-react-native";

const storageSizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

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

  return `${storageSizeFormatter.format(value)} ${units[unitIndex]}`;
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
      "Remove offline copy?",
      `"${displayTitle}" will no longer be kept for offline reading.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeOfflineArticle(scope, bookmarkId),
        },
      ],
    );
  };

  const confirmRemoveAll = () => {
    Alert.alert(
      "Remove all offline content?",
      "This removes every article you explicitly saved for offline reading.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove All",
          style: "destructive",
          onPress: () => removeAllOfflineArticles(scope),
        },
      ],
    );
  };

  const confirmClearRecentCache = () => {
    Alert.alert(
      "Clear recent cache?",
      "Saved offline articles will be kept. Anything else will be re-cached as you browse.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: () => {
            queryClient.clear();
            clearPersistedCache();
            toast({ message: "Recent cache cleared" });
          },
        },
      ],
    );
  };

  return (
    <SettingsScreen>
      <Text className="px-1 text-sm text-muted-foreground">
        Saved offline articles stay on this device. Everything else is cached
        only as you browse and can be cleared at any time.
      </Text>

      <View className="gap-4">
        <View className="gap-2">
          <CacheSectionHeader
            title="Saved offline content"
            size={offlineLibrarySize}
          />

          {offlineLibrary.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No saved offline articles"
              subtitle="Open an article and choose Make available offline."
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
                        Saved{" "}
                        {formatDistanceToNow(item.savedAt, { addSuffix: true })}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Remove ${item.displayTitle} offline copy`}
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
              label="Remove all offline content"
              onPress={confirmRemoveAll}
            />
          </SettingsGroup>
        ) : null}
      </View>

      <View className="gap-2">
        <CacheSectionHeader title="Recent cache" size={recentCacheSize} />
        <SettingsGroup>
          <SettingsActionRow
            centered
            label="Clear recent cache"
            onPress={confirmClearRecentCache}
          />
        </SettingsGroup>
      </View>
    </SettingsScreen>
  );
}
