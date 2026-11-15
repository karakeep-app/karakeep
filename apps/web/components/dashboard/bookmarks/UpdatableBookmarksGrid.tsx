"use client";

import { useEffect, useMemo } from "react";
import UploadDropzone from "@/components/dashboard/UploadDropzone";
import { useNewItemTargetStore } from "@/lib/store/useNewItemTargetStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { useBookmarkDisplaySettings } from "@/lib/userLocalSettings/bookmarksLayout";
import { useInfiniteQuery } from "@tanstack/react-query";

import type {
  ZGetBookmarksRequest,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { BookmarkGridContextProvider } from "@karakeep/shared-react/hooks/bookmark-grid-context";
import { useTRPC } from "@karakeep/shared-react/trpc";

import BookmarksGrid from "./BookmarksGrid";

export default function UpdatableBookmarksGrid({
  query,
  bookmarks: initialBookmarks,
  showEditorCard = false,
}: {
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">; // Sort order is handled by the store
  bookmarks: ZGetBookmarksResponse;
  showEditorCard?: boolean;
  itemsPerPage?: number;
}) {
  const api = useTRPC();
  const { showNewItemCard } = useBookmarkDisplaySettings();
  let sortOrder = useSortOrderStore((state) => state.sortOrder);
  if (sortOrder === "relevance") {
    // Relevance is not supported in the `getBookmarks` endpoint.
    sortOrder = "desc";
  }

  const finalQuery = useMemo(
    () => ({ ...query, sortOrder, includeContent: false }),
    [query, sortOrder],
  );

  // When the new item card isn't shown inline, the header shows a button that
  // opens the editor instead. Tell it which grid new bookmarks belong to.
  const setNewItemTarget = useNewItemTargetStore((state) => state.setQuery);
  const clearNewItemTarget = useNewItemTargetStore((state) => state.clearQuery);
  useEffect(() => {
    if (!showEditorCard) {
      return;
    }
    setNewItemTarget(finalQuery);
    return () => clearNewItemTarget(finalQuery);
  }, [showEditorCard, finalQuery, setNewItemTarget, clearNewItemTarget]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useInfiniteQuery(
      api.bookmarks.getBookmarks.infiniteQueryOptions(
        { ...finalQuery, useCursorV2: true },
        {
          initialData: () => ({
            pages: [initialBookmarks],
            pageParams: [query.cursor ?? null],
          }),
          initialCursor: null,
          getNextPageParam: (lastPage) => lastPage.nextCursor,
          refetchOnMount: true,
        },
      ),
    );

  useEffect(() => {
    refetch();
  }, [sortOrder, refetch]);

  const grid = (
    <BookmarksGrid
      bookmarks={data.pages.flatMap((b) => b.bookmarks)}
      hasNextPage={hasNextPage}
      fetchNextPage={fetchNextPage}
      isFetchingNextPage={isFetchingNextPage}
      showEditorCard={showEditorCard && showNewItemCard}
    />
  );

  return (
    <BookmarkGridContextProvider query={finalQuery}>
      {showEditorCard ? <UploadDropzone>{grid}</UploadDropzone> : grid}
    </BookmarkGridContextProvider>
  );
}
