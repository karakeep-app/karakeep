import { useRef } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { useScrollToTop } from "@react-navigation/native";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import BookmarkCard from "./BookmarkCard";

export default function BookmarkList({
  bookmarks,
  header,
  onRefresh,
  fetchNextPage,
  isFetchingNextPage,
  isRefreshing,
  layout = "grid",
}: {
  bookmarks: ZBookmark[];
  onRefresh: () => void;
  isRefreshing: boolean;
  fetchNextPage?: () => void;
  header?: React.ReactElement;
  isFetchingNextPage?: boolean;
  layout?: "grid" | "list";
}) {
  const flatListRef = useRef(null);
  useScrollToTop(flatListRef);

  return (
    <Animated.FlatList
      ref={flatListRef}
      itemLayoutAnimation={LinearTransition}
      ListHeaderComponent={header}
      contentContainerStyle={{
        gap: layout === "list" ? 8 : 15,
        marginHorizontal: 15,
        marginBottom: 15,
      }}
      numColumns={layout === "grid" ? 2 : 1}
      key={layout}
      columnWrapperStyle={layout === "grid" ? { gap: 15 } : undefined}
      renderItem={(b) => <BookmarkCard bookmark={b.item} layout={layout} />}
      ListEmptyComponent={
        <View className="items-center justify-center pt-4">
          <Text variant="title3">No Bookmarks</Text>
        </View>
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
  );
}
