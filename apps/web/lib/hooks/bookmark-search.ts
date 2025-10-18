import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { api } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";

import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

import { useInSearchPageStore } from "../store/useInSearchPageStore";

// Safely decode URI component with specific URIError handling
function safeDecodeURIComponent(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch (error) {
    // Specifically handle URIError by falling back to raw query
    if (error instanceof URIError) {
      return uri;
    }
    // Re-throw any other types of errors
    throw error;
  }
}

function useSearchQuery() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get("q") ?? "";
  const searchQuery = safeDecodeURIComponent(rawQuery);

  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  return { searchQuery, parsedSearchQuery: parsed };
}

export function useDoBookmarkSearch() {
  const router = useRouter();
  const { searchQuery, parsedSearchQuery } = useSearchQuery();
  const isInSearchPage = useInSearchPageStore((val) => val.inSearchPage);
  const timeoutId = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    return () => {
      if (!timeoutId.current) {
        return;
      }
      clearTimeout(timeoutId.current);
    };
  }, [timeoutId]);

  const doSearch = (val: string) => {
    timeoutId.current = null;
    router.replace(`/dashboard/search?q=${encodeURIComponent(val)}`);
  };

  const debounceSearch = (val: string) => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }
    timeoutId.current = setTimeout(() => {
      doSearch(val);
    }, 10);
  };

  return {
    doSearch,
    debounceSearch,
    searchQuery,
    parsedSearchQuery,
    isInSearchPage,
  };
}

export function useBookmarkSearch() {
  const { searchQuery } = useSearchQuery();
  const sortOrder = useSortOrderStore((state) => state.sortOrder);

  const {
    data,
    isPending,
    isPlaceholderData,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = api.bookmarks.searchBookmarks.useInfiniteQuery(
    {
      text: searchQuery,
      sortOrder,
    },
    {
      placeholderData: keepPreviousData,
      gcTime: 0,
      initialCursor: null,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  useEffect(() => {
    refetch();
  }, [refetch, sortOrder]);

  if (error) {
    throw error;
  }

  return {
    error,
    data,
    isPending,
    isPlaceholderData,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  };
}
