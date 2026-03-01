import { useMemo } from "react";
import { FlatList, Pressable, View } from "react-native";
import BookmarkList from "@/components/bookmarks/BookmarkList";
import FullPageError from "@/components/FullPageError";
import FullPageSpinner from "@/components/ui/FullPageSpinner";
import { Text } from "@/components/ui/Text";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";

const MAX_DISPLAY_SUGGESTIONS = 5;

interface BookmarkSearchResultsProps {
  query: string;
  isInputFocused: boolean;
  onSelectHistory: (term: string) => void;
}

export default function BookmarkSearchResults({
  query: rawQuery,
  isInputFocused,
  onSelectHistory,
}: BookmarkSearchResultsProps) {
  const query = useDebounce(rawQuery, 10);

  const { history, addTerm, clearHistory } = useSearchHistory({
    getItem: (k: string) => AsyncStorage.getItem(k),
    setItem: (k: string, v: string) => AsyncStorage.setItem(k, v),
    removeItem: (k: string) => AsyncStorage.removeItem(k),
  });

  const api = useTRPC();
  const queryClient = useQueryClient();

  const onRefresh = () => {
    queryClient.invalidateQueries(api.bookmarks.searchBookmarks.pathFilter());
  };

  const {
    data,
    error,
    refetch,
    isPending,
    isFetching,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(
    api.bookmarks.searchBookmarks.infiniteQueryOptions(
      { text: query },
      {
        placeholderData: keepPreviousData,
        gcTime: 0,
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    ),
  );

  const filteredHistory = useMemo(() => {
    if (rawQuery.trim().length === 0) {
      return history.slice(0, MAX_DISPLAY_SUGGESTIONS);
    }
    return history
      .filter((item) => item.toLowerCase().includes(rawQuery.toLowerCase()))
      .slice(0, MAX_DISPLAY_SUGGESTIONS);
  }, [rawQuery, history]);

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  const handleSelectHistory = (term: string) => {
    addTerm(term);
    onSelectHistory(term);
  };

  const renderHistoryItem = ({ item }: { item: string }) => (
    <Pressable
      onPress={() => handleSelectHistory(item)}
      className="border-b border-gray-200 p-3"
    >
      <Text className="text-foreground">{item}</Text>
    </Pressable>
  );

  if (isInputFocused) {
    return (
      <FlatList
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
            No matching searches.
          </Text>
        }
        keyboardShouldPersistTaps="handled"
      />
    );
  }

  if (isFetching && query.length > 0) {
    return <FullPageSpinner />;
  }

  if (data && query.length > 0) {
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
