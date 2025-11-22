import { useRef } from "react";
import { ActivityIndicator, Keyboard, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { Text } from "@/components/ui/Text";
import { useScrollToTop } from "@react-navigation/native";

import type { ZHighlight } from "@karakeep/shared/types/highlights";

import HighlightCard from "./HighlightCard";

export default function HighlightList({
  highlights,
  header,
  onRefresh,
  fetchNextPage,
  isFetchingNextPage,
  isRefreshing,
}: {
  highlights: ZHighlight[];
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
      renderItem={(h) => <HighlightCard highlight={h.item} />}
      ListEmptyComponent={
        <View className="items-center justify-center pt-4">
          <Text variant="title3">No Highlights</Text>
          <Text className="mt-2 text-center text-muted-foreground">
            Highlights you create will appear here
          </Text>
        </View>
      }
      data={highlights}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      onScrollBeginDrag={Keyboard.dismiss}
      keyExtractor={(h) => h.id}
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
