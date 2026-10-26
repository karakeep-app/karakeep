import { useEffect } from "react";
import { Alert, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import EmptyState from "@/components/ui/EmptyState";
import { Text } from "@/components/ui/Text";
import { excludeFromOfflineDownloads } from "@/lib/offlineDownloadPrefs";
import type { OfflineLibraryItem } from "@/lib/offlineLibrary";
import {
  getOfflineLibraryScope,
  reconcileOfflineLibrary,
  removeOfflineArticle,
  useOfflineLibrary,
} from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import { formatStorageSize } from "@/lib/storageSize";
import { useColorScheme } from "@/lib/useColorScheme";
import { FlashList } from "@shopify/flash-list";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Trash2 } from "lucide-react-native";

function describe(item: OfflineLibraryItem) {
  const parts = [
    item.source === "manual" ? "Saved by you" : "Downloaded automatically",
    formatDistanceToNow(item.savedAt, { addSuffix: true }),
  ];
  if (item.byteSize !== undefined) {
    parts.push(formatStorageSize(item.byteSize));
  }
  return parts.join(" · ");
}

export default function OfflineArticles() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const { settings } = useAppSettings();
  const { colors } = useColorScheme();
  const scope = getOfflineLibraryScope(settings);
  const items = useOfflineLibrary(scope);

  useEffect(() => {
    reconcileOfflineLibrary(scope);
  }, [scope]);

  const confirmRemove = (item: OfflineLibraryItem) => {
    Alert.alert(
      "Remove offline copy?",
      `"${item.displayTitle}" will be removed from this device and skipped by automatic downloads.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            excludeFromOfflineDownloads(scope, item.bookmarkId);
            removeOfflineArticle(scope, item.bookmarkId);
          },
        },
      ],
    );
  };

  return (
    <FlashList
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingBottom: 40 + headerHeight,
        paddingHorizontal: 16,
        paddingTop: 12,
      }}
      data={items}
      keyExtractor={(item) => item.bookmarkId}
      ItemSeparatorComponent={() => <View className="h-2" />}
      ListEmptyComponent={
        <EmptyState
          icon={BookOpen}
          title="No downloaded articles"
          subtitle="Turn on automatic downloads, or open an article and make it available offline."
        />
      }
      renderItem={({ item }) => (
        <View
          className="flex-row items-center rounded-xl bg-card px-4 py-3"
          style={{ borderCurve: "continuous" }}
        >
          <Pressable
            accessibilityRole="button"
            className="min-w-0 flex-1 active:opacity-70"
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
              {describe(item)}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Remove ${item.displayTitle} offline copy`}
            accessibilityRole="button"
            className="ml-3 p-2"
            hitSlop={8}
            onPress={() => confirmRemove(item)}
          >
            <Trash2 size={18} color={colors.destructive} />
          </Pressable>
        </View>
      )}
    />
  );
}
