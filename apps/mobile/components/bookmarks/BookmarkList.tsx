import { useRef } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import EmptyState from "@/components/ui/EmptyState";
import { getGridColumns, useContainerWidth } from "@/lib/responsive";
import useAppSettings from "@/lib/settings";
import { useScrollToTop } from "expo-router";
import { Bookmark } from "lucide-react-native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import BookmarkCard from "./BookmarkCard";

const HORIZONTAL_MARGIN = 15;
const GAP = 12;

export default function BookmarkList({
  bookmarks,
  header,
  onRefresh,
  fetchNextPage,
  isFetchingNextPage,
  isRefreshing,
}: {
  bookmarks: ZBookmark[];
  onRefresh: () => void;
  isRefreshing: boolean;
  fetchNextPage?: () => void;
  header?: React.ReactElement;
  isFetchingNextPage?: boolean;
}) {
  const flatListRef = useRef(null);
  useScrollToTop(flatListRef);
  const { settings } = useAppSettings();
  const { width: containerWidth, onLayout } = useContainerWidth();
  const { numColumns, columnWidth } = getGridColumns({
    containerWidth,
    horizontalInset: HORIZONTAL_MARGIN,
    gap: GAP,
    minColumnWidth: settings.bookmarkLayout === "list" ? 420 : 340,
  });

  return (
    <View className="flex-1" onLayout={onLayout}>
      <Animated.FlatList
        ref={flatListRef}
        // FlatList doesn't support changing numColumns on the fly.
        key={numColumns}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? { gap: GAP } : undefined}
        // Reanimated only supports item layout animations in single-column lists.
        itemLayoutAnimation={numColumns > 1 ? undefined : LinearTransition}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        contentContainerStyle={{
          gap: GAP,
          marginHorizontal: HORIZONTAL_MARGIN,
          paddingBottom: 20,
        }}
        renderItem={(b) =>
          numColumns > 1 ? (
            <View style={{ width: columnWidth }}>
              <BookmarkCard bookmark={b.item} />
            </View>
          ) : (
            <BookmarkCard bookmark={b.item} />
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon={Bookmark}
            title="No Bookmarks"
            subtitle="Your saved bookmarks will appear here"
          />
        }
        data={bookmarks}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        onScrollBeginDrag={Keyboard.dismiss}
        keyExtractor={(b) => b.id}
        onEndReached={fetchNextPage}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="items-center">
              <ActivityIndicator />
            </View>
          ) : (
            <View />
          )
        }
      />
    </View>
  );
}
