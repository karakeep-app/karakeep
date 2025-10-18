import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { api } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";

import { parseSearchQuery } from "@karakeep/shared/searchQueryParser";

import { useInSearchPageStore } from "../store/useInSearchPageStore";

/**
 * Safely decode URI component with specific URIError handling
 *
 * This function attempts to decode a URI component and handles URIError
 * exceptions by falling back to the raw query string. This prevents
 * crashes when search queries contain malformed percent-encoded characters.
 *
 * @param uri - The URI component string to decode
 * @returns The decoded string or the original string if decoding fails
 * @throws Error - Re-throws any non-URIError exceptions
 */
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

/**
 * Custom hook to extract and parse the search query from URL parameters
 *
 * This hook retrieves the search query parameter from the URL, safely decodes
 * it to handle percent-encoded characters, and parses it using the search
 * query parser.
 *
 * @returns An object containing the raw search query and parsed search query
 */
function useSearchQuery() {
  const searchParams = useSearchParams();
  const rawQuery = searchParams.get("q") ?? "";
  const searchQuery = safeDecodeURIComponent(rawQuery);

  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  return { searchQuery, parsedSearchQuery: parsed };
}

/**
 * Custom hook for handling bookmark search functionality
 *
 * This hook provides functions for performing searches and debounced searches,
 * along with access to the current search query and parsed search query.
 *
 * @returns An object containing search functions and current search state
 */
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

  /**
   * Perform a search by navigating to the search page with the query
   * @param val - The search query string
   */
  const doSearch = (val: string) => {
    timeoutId.current = null;
    router.replace(`/dashboard/search?q=${encodeURIComponent(val)}`);
  };

  /**
   * Perform a debounced search, delaying execution to prevent excessive navigation
   * @param val - The search query string
   */
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

/**
 * Custom hook for searching bookmarks with infinite scroll support
 *
 * This hook uses the tRPC API to perform bookmark searches with infinite
 * scroll pagination. It handles search query parsing, sorting, and
 * pagination automatically.
 *
 * @returns An object containing search results and pagination state
 */
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
