import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Text } from "@/components/ui/Text";
import { api } from "@/lib/trpc";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ExternalLink, Trash2 } from "lucide-react-native";

import type { ZHighlight } from "@karakeep/shared/types/highlights";
import { useDeleteHighlight } from "@karakeep/shared-react/hooks/highlights";

import { useToast } from "../ui/Toast";

dayjs.extend(relativeTime);

// Color map for highlights (mapped to Tailwind CSS classes used in NativeWind)
const HIGHLIGHT_COLOR_MAP = {
  red: "#fecaca", // bg-red-200
  green: "#bbf7d0", // bg-green-200
  blue: "#bfdbfe", // bg-blue-200
  yellow: "#fef08a", // bg-yellow-200
} as const;

export default function HighlightCard({
  highlight,
}: {
  highlight: ZHighlight;
}) {
  const { toast } = useToast();
  const router = useRouter();

  const onError = () => {
    toast({
      message: "Something went wrong",
      variant: "destructive",
      showProgress: false,
    });
  };

  const { mutate: deleteHighlight, isPending: isDeleting } = useDeleteHighlight(
    {
      onSuccess: () => {
        toast({
          message: "Highlight has been deleted!",
          showProgress: false,
        });
      },
      onError,
    },
  );

  const deleteHighlightAlert = () =>
    Alert.alert(
      "Delete highlight?",
      "Are you sure you want to delete this highlight?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: () => deleteHighlight({ highlightId: highlight.id }),
          style: "destructive",
        },
      ],
    );

  const { data: bookmark } = api.bookmarks.getBookmark.useQuery(
    {
      bookmarkId: highlight.bookmarkId,
    },
    {
      retry: false,
    },
  );

  const handleBookmarkPress = () => {
    Haptics.selectionAsync();
    router.push(`/dashboard/bookmarks/${highlight.bookmarkId}`);
  };

  return (
    <View className="overflow-hidden rounded-xl bg-card p-4">
      <View className="flex gap-3">
        {/* Highlight text with colored border */}
        <View
          className="rounded-r-lg border-l-4 bg-muted/30 p-3"
          style={{ borderLeftColor: HIGHLIGHT_COLOR_MAP[highlight.color] }}
        >
          <Text className="italic text-foreground">
            {highlight.text || "No text available"}
          </Text>
        </View>

        {/* Note if present */}
        {highlight.note && (
          <View className="rounded-lg bg-muted/50 p-2">
            <Text className="text-sm text-muted-foreground">
              Note: {highlight.note}
            </Text>
          </View>
        )}

        {/* Footer with timestamp and actions */}
        <View className="flex flex-row items-center justify-between">
          <View className="flex flex-row items-center gap-2">
            <Text className="text-xs text-muted-foreground">
              {dayjs(highlight.createdAt).fromNow()}
            </Text>
            {bookmark && (
              <>
                <Text className="text-xs text-muted-foreground">•</Text>
                <Pressable
                  onPress={handleBookmarkPress}
                  className="flex flex-row items-center gap-1"
                >
                  <ExternalLink size={12} color="gray" />
                  <Text className="text-xs text-muted-foreground">Source</Text>
                </Pressable>
              </>
            )}
          </View>

          <View className="flex flex-row gap-2">
            {isDeleting ? (
              <ActivityIndicator size="small" />
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  deleteHighlightAlert();
                }}
              >
                <Trash2 size={18} color="#ef4444" />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
