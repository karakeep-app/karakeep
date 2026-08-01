import { FlatList, Pressable, View } from "react-native";
import BookmarkList from "@/components/bookmarks/BookmarkList";
import QueryPageState from "@/components/QueryPageState";
import { Text } from "@/components/ui/Text";

import type { BookmarkSearchState } from "@/lib/useBookmarkSearchState";

interface BookmarkSearchResultsProps {
  rawSearch: string;
  isInputFocused: boolean;
  state: BookmarkSearchState;
  onSelectHistory: (term: string) => void;
  header?: React.ReactElement;
}

export default function BookmarkSearchResults({
  rawSearch,
  state,
  onSelectHistory,
  header,
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
          <View>
            {header}
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

  if (!data) {
    return <QueryPageState error={error} onRetry={() => refetch()} />;
  }

  return (
    <BookmarkList
      bookmarks={data.pages.flatMap((p) => p.bookmarks)}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onRefresh={onRefresh}
      isRefreshing={isPending}
      header={header}
    />
  );
}
