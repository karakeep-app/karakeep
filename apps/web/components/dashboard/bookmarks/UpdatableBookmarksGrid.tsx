"use client";

import { useEffect } from "react";
import UploadDropzone from "@/components/dashboard/UploadDropzone";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { useSortOrder } from "@/lib/userLocalSettings/bookmarksLayout";
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
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">; // Sort order comes from user local settings
  bookmarks: ZGetBookmarksResponse;
  showEditorCard?: boolean;
  itemsPerPage?: number;
}) {
  const api = useTRPC();
  const defaultSortOrder = useSortOrder();
  const overrideSortOrder = useSortOrderStore((state) => state.sortOrder);
  const sortOrder =
    overrideSortOrder === null || overrideSortOrder === "relevance"
      ? // Relevance is not supported in the `getBookmarks` endpoint.
        defaultSortOrder
      : overrideSortOrder;

  const finalQuery = { ...query, sortOrder, includeContent: false };

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
      showEditorCard={showEditorCard}
    />
  );

  return (
    <BookmarkGridContextProvider query={finalQuery}>
      {showEditorCard ? <UploadDropzone>{grid}</UploadDropzone> : grid}
    </BookmarkGridContextProvider>
  );
}
