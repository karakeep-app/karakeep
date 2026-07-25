import { useEffect } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import EmptyState from "@/components/ui/EmptyState";
import { Divider } from "@/components/ui/Divider";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import { clearPersistedCache } from "@/lib/offlineCache";
import {
  getOfflineLibraryScope,
  reconcileOfflineLibrary,
  removeAllOfflineArticles,
  removeOfflineArticle,
  useOfflineLibrary,
} from "@/lib/offlineLibrary";
import useAppSettings from "@/lib/settings";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BookOpen, Trash2 } from "lucide-react-native";

export default function OfflineContent() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { settings } = useAppSettings();
  const { colors } = useColorScheme();
  const scope = getOfflineLibraryScope(settings);
  const offlineLibrary = useOfflineLibrary(scope);

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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: 40 + headerHeight,
      }}
    >
      <Text className="px-1 pb-3 text-sm text-muted-foreground">
        Saved offline articles stay on this device. Everything else is cached
        only as you browse and can be cleared at any time.
      </Text>

      {offlineLibrary.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No saved offline articles"
          subtitle="Open an article and choose Make available offline."
        />
      ) : (
        <View
          className="w-full rounded-xl bg-card py-1"
          style={{ borderCurve: "continuous" }}
        >
          {offlineLibrary.map((item, index) => (
            <View key={item.bookmarkId}>
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
                  {item.url && (
                    <Text
                      className="mt-0.5 text-xs text-muted-foreground"
                      numberOfLines={1}
                    >
                      {item.url}
                    </Text>
                  )}
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
              {index < offlineLibrary.length - 1 && (
                <Divider orientation="horizontal" className="mx-6" />
              )}
            </View>
          ))}
        </View>
      )}

      {offlineLibrary.length > 0 && (
        <Pressable
          className="mt-4 rounded-xl bg-card px-4 py-3"
          onPress={confirmRemoveAll}
        >
          <Text className="text-center text-destructive">
            Remove all offline content
          </Text>
        </Pressable>
      )}

      <View className="mt-8">
        <Text className="px-1 pb-2 text-xs uppercase tracking-wide text-muted-foreground">
          Recent cache
        </Text>
        <Pressable
          className="rounded-xl bg-card px-4 py-3"
          onPress={confirmClearRecentCache}
        >
          <Text className="text-center text-destructive">
            Clear recent cache
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
