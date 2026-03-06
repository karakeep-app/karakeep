import { useState } from "react";
import { KeyboardAvoidingView, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import BookmarkAssetView from "@/components/bookmarks/BookmarkAssetView";
import BookmarkLinkTypeSelector, {
  BookmarkLinkType,
} from "@/components/bookmarks/BookmarkLinkTypeSelector";
import BookmarkLinkView from "@/components/bookmarks/BookmarkLinkView";
import BookmarkTextView from "@/components/bookmarks/BookmarkTextView";
import BottomActions from "@/components/bookmarks/BottomActions";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import useAppSettings from "@/lib/settings";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

export default function BookmarkView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { settings } = useAppSettings();
  const api = useTRPC();

  const [bookmarkLinkType, setBookmarkLinkType] = useState<BookmarkLinkType>(
    settings.defaultBookmarkView,
  );

  if (typeof slug !== "string") {
    throw new Error("Unexpected param type");
  }

  const {
    data: bookmark,
    error,
    refetch,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId: slug,
      includeContent: false,
    }),
  );

  if (error) {
    return <FullPageError error={error.message} onRetry={refetch} />;
  }

  if (!bookmark) {
    return <FullPageSpinner />;
  }

  let comp;
  let title = null;
  switch (bookmark.content.type) {
    case BookmarkTypes.LINK:
      title = bookmark.title ?? bookmark.content.title;
      comp = (
        <BookmarkLinkView
          bookmark={bookmark}
          bookmarkPreviewType={bookmarkLinkType}
        />
      );
      break;
    case BookmarkTypes.TEXT:
      title = bookmark.title;
      comp = <BookmarkTextView bookmark={bookmark} />;
      break;
    case BookmarkTypes.ASSET:
      title = bookmark.title ?? bookmark.content.fileName;
      comp = <BookmarkAssetView bookmark={bookmark} />;
      break;
  }
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, paddingBottom: insets.bottom + 8 }}
      behavior="height"
    >
      <Stack.Screen
        options={{
          headerTitle: title ?? "",
          headerBackTitle: "Back",
          headerTransparent: false,
          headerShown: true,
          headerStyle: {
            backgroundColor: isDark ? "#000" : "#fff",
          },
          headerTintColor: isDark ? "#fff" : "#000",
          headerRight: () =>
            bookmark.content.type === BookmarkTypes.LINK ? (
              <View className="flex-row items-center gap-3 px-4">
                {bookmarkLinkType === "reader" && (
                  <Pressable
                    onPress={() =>
                      router.push("/dashboard/settings/reader-settings")
                    }
                  >
                    <Settings size={20} color="gray" />
                  </Pressable>
                )}
                <BookmarkLinkTypeSelector
                  type={bookmarkLinkType}
                  onChange={(type) => setBookmarkLinkType(type)}
                  bookmark={bookmark}
                />
              </View>
            ) : undefined,
        }}
      />
      {comp}
      <BottomActions bookmark={bookmark} />
    </KeyboardAvoidingView>
  );
}
