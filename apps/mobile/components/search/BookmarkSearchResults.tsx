import { FlatList, Pressable, View } from "react-native";
import BookmarkList from "@/components/bookmarks/BookmarkList";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Text } from "@/components/ui/Text";

import type { BookmarkSearchState } from "@/lib/useBookmarkSearchState";

interface BookmarkSearchResultsProps {
  rawSearch: string;
  isInputFocused: boolean;
  state: BookmarkSearchState;
  onSelectHistory: (term: string) => void;
}

export default function BookmarkSearchResults({
  rawSearch,
  state,
  onSelectHistory,
}: BookmarkSearchResultsProps) {
  const {
    history,
    filteredHistory,
    clearHistory,
    data,
    error,
    refetch,
    isPending,
    fetchNextPage,
    isFetchingNextPage,
    onRefresh,
  } = state;

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  const renderHistoryItem = ({ item }: { item: string }) => (
    <Pressable
      onPress={() => onSelectHistory(item)}
      className="border-b border-border p-3"
    >
      <Text className="text-foreground">{item}</Text>
    </Pressable>
  );

  if (rawSearch.trim().length === 0) {
    return (
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={filteredHistory}
        renderItem={renderHistoryItem}
        keyExtractor={(item, index) => `${item}-${index}`}
        ListHeaderComponent={
          <View className="flex-row items-center justify-between p-3">
            <Text className="text-sm font-bold text-gray-500">
              Recent Searches
            </Text>
            {history.length > 0 && (
              <Pressable onPress={clearHistory}>
                <Text className="text-sm text-blue-500">Clear</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text className="p-3 text-center text-gray-500">
            No recent searches
          </Text>
        }
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  if (isPending) {
    return <FullPageSpinner />;
  }

  if (data) {
    return (
      <BookmarkList
        bookmarks={data.pages.flatMap((p) => p.bookmarks)}
        fetchNextPage={fetchNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onRefresh={onRefresh}
        isRefreshing={isPending}
      />
    );
  }

  return null;
}
