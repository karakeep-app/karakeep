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

  return (
    <Animated.FlatList
      ref={flatListRef}
      itemLayoutAnimation={LinearTransition}
      ListHeaderComponent={header}
      contentContainerStyle={{
        gap: 15,
        marginHorizontal: 15,
        marginBottom: 15,
      }}
      renderItem={(b) => <BookmarkCard bookmark={b.item} />}
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
