"use client";

import { useEffect, useState } from "react";
import UploadDropzone from "@/components/dashboard/UploadDropzone";
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
import EditorCard from "./EditorCard";

export default function UpdatableBookmarksGrid({
  query,
  bookmarks: initialBookmarks,
  showEditorCard: canCreateBookmarks = false,
}: {
  query: Omit<ZGetBookmarksRequest, "sortOrder" | "includeContent">; // Sort order is handled by the store
  bookmarks: ZGetBookmarksResponse;
  showEditorCard?: boolean;
  itemsPerPage?: number;
}) {
  const api = useTRPC();
  const { showNewItemCard } = useBookmarkDisplaySettings();
  const [editorDialogOpen, setEditorDialogOpen] = useState(false);
  const showEditorDialog = canCreateBookmarks && !showNewItemCard;
  let sortOrder = useSortOrderStore((state) => state.sortOrder);
  if (sortOrder === "relevance") {
    // Relevance is not supported in the `getBookmarks` endpoint.
    sortOrder = "desc";
  }

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
      showEditorCard={canCreateBookmarks && showNewItemCard}
      keyboardNavigationDisabled={showEditorDialog && editorDialogOpen}
    />
  );

  return (
    <BookmarkGridContextProvider query={finalQuery}>
      {canCreateBookmarks ? (
        <UploadDropzone>
          {grid}
          {showEditorDialog && (
            <EditorCard
              dialog={{
                open: editorDialogOpen,
                onOpenChange: setEditorDialogOpen,
              }}
            />
          )}
        </UploadDropzone>
      ) : (
        grid
      )}
    </BookmarkGridContextProvider>
  );
}
