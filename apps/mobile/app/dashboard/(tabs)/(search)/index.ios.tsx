import { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Pressable, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import type { SearchBarCommands } from "react-native-screens";
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

export default function SearchTab() {
  const [search, setSearch] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const query = useDebounce(search, 300);
  const searchBarRef = useRef<SearchBarCommands>(
    null,
  ) as React.RefObject<SearchBarCommands>;

  useFocusEffect(
    useCallback(() => {
      const id = setTimeout(() => searchBarRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }, []),
  );

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

  const { data, error, refetch, isPending, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      api.bookmarks.searchBookmarks.infiniteQueryOptions(
        { text: query },
        {
          enabled: query.trim().length > 0,
          placeholderData: keepPreviousData,
          gcTime: 0,
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
      ),
    );

  const filteredHistory = useMemo(() => {
    if (search.trim().length === 0) {
      return history.slice(0, MAX_DISPLAY_SUGGESTIONS);
    }
    return history
      .filter((item) => item.toLowerCase().includes(search.toLowerCase()))
      .slice(0, MAX_DISPLAY_SUGGESTIONS);
  }, [search, history]);

  if (error) {
    return <FullPageError error={error.message} onRetry={() => refetch()} />;
  }

  const handleSearchSubmit = (searchTerm: string) => {
    const term = searchTerm.trim();
    if (term.length > 0) {
      addTerm(term);
      setSearch(term);
    }
    Keyboard.dismiss();
  };

  const renderHistoryItem = ({ item }: { item: string }) => (
    <Pressable
      onPress={() => handleSearchSubmit(item)}
      className="border-b border-gray-200 p-3"
    >
      <Text className="text-foreground">{item}</Text>
    </Pressable>
  );

  const showHistory = isSearchFocused || query.length === 0;
  const showResults = !isSearchFocused && query.length > 0;

  function renderSearchContent() {
    if (showHistory) {
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
    if (showResults && isPending) {
      return <FullPageSpinner />;
    }
    if (showResults && data) {
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

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            ref: searchBarRef,
            placeholder: "Search bookmarks...",
            onChangeText: (event) => setSearch(event.nativeEvent.text),
            onFocus: () => setIsSearchFocused(true),
            onBlur: () => {
              setIsSearchFocused(false);
              const normalized = search.trim();
              if (normalized.length > 0) {
                addTerm(normalized);
              }
            },
            onSearchButtonPress: () => handleSearchSubmit(search),
            autoCapitalize: "none",
            hideWhenScrolling: false,
          },
        }}
      />

      {renderSearchContent()}
    </>
  );
}
