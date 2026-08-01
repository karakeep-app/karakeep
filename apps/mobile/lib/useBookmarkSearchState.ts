import { useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { useSearchHistory } from "@karakeep/shared-react/hooks/search-history";
import { useDebounce } from "@karakeep/shared-react/hooks/use-debounce";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

import type { ZBookmarkSearchMode } from "@karakeep/shared/types/bookmarks";

import { useClientConfig } from "./client-config";

const MAX_DISPLAY_SUGGESTIONS = 5;
const DEBOUNCE_MS = 10;

export function useBookmarkSearchState(rawSearch: string) {
  const query = useDebounce(rawSearch, DEBOUNCE_MS);
  const { semanticSearchEnabled } = useClientConfig().search;
  const [searchMode, setSearchMode] = useState<ZBookmarkSearchMode>("fts");
  const parsedQuery = useMemo(() => parseSearchQuery(query), [query]);
  const effectiveSearchMode =
    semanticSearchEnabled && parsedQuery.text.trim().length > 0
      ? searchMode
      : "fts";

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
        { text: query, searchMode: effectiveSearchMode },
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
    if (rawSearch.trim().length === 0) {
      return history.slice(0, MAX_DISPLAY_SUGGESTIONS);
    }
    return history
      .filter((item) => item.toLowerCase().includes(rawSearch.toLowerCase()))
      .slice(0, MAX_DISPLAY_SUGGESTIONS);
  }, [rawSearch, history]);

  const commitTerm = (term: string) => {
    const normalized = term.trim();
    if (normalized.length > 0) {
      addTerm(normalized);
    }
  };

  return {
    query,
    searchMode,
    setSearchMode,
    semanticSearchEnabled,
    history,
    filteredHistory,
    addTerm,
    commitTerm,
    clearHistory,
    data,
    error,
    refetch,
    isPending,
    fetchNextPage,
    isFetchingNextPage,
    onRefresh,
  };
}

export type BookmarkSearchState = ReturnType<typeof useBookmarkSearchState>;
