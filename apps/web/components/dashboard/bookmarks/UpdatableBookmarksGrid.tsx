"use client";

import { useEffect } from "react";
import UploadDropzone from "@/components/dashboard/UploadDropzone";
import { useInArchivePageStore } from "@/lib/store/useInArchivePageStore";
import { useSortOrderStore } from "@/lib/store/useSortOrderStore";
import { api } from "@/lib/trpc";

import type {
  ZGetBookmarksRequest,
  ZGetBookmarksResponse,
} from "@karakeep/shared/types/bookmarks";
import { BookmarkGridContextProvider } from "@karakeep/shared-react/hooks/bookmark-grid-context";

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
  const { setInArchivePage } = useInArchivePageStore();

  useEffect(() => {
    // Set archive page state based on query
    setInArchivePage(query.archived === true);
    return () => {
      setInArchivePage(false);
    };
  }, [query.archived, setInArchivePage]);

  let sortOrder = useSortOrderStore((state) => state.sortOrder);
  if (sortOrder === "relevance") {
    // Relevance is not supported in the `getBookmarks` endpoint.
    sortOrder = "desc";
  }
  if (!query.archived && sortOrder === "archivedAt") {
    // archivedAt sort is only supported on the archive page.
    sortOrder = "desc";
  }

  const finalQuery = { ...query, sortOrder, includeContent: false };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    api.bookmarks.getBookmarks.useInfiniteQuery(
      { ...finalQuery, useCursorV2: true },
      {
        initialData: () => ({
          pages: [initialBookmarks],
          pageParams: [query.cursor],
        }),
        initialCursor: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        refetchOnMount: true,
      },
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
