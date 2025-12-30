import { useEffect, useMemo } from "react";
import NoBookmarksBanner from "@/components/dashboard/bookmarks/NoBookmarksBanner";
import { ActionButton } from "@/components/ui/action-button";
import useBulkActionsStore from "@/lib/bulkActions";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";
import tailwindConfig from "@/tailwind.config";
import { Slot } from "@radix-ui/react-slot";
import { ErrorBoundary } from "react-error-boundary";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import resolveConfig from "tailwindcss/resolveConfig";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";

import BookmarkCard from "./BookmarkCard";
import EditorCard from "./EditorCard";
import UnknownCard from "./UnknownCard";

function StyledBookmarkCard({ children }: { children: React.ReactNode }) {
  return (
    <Slot className="mb-4 border border-border bg-card duration-300 ease-in hover:shadow-lg hover:transition-all">
      {children}
    </Slot>
  );
}

function getBreakpointConfig(userColumns: number) {
  const fullConfig = resolveConfig(tailwindConfig);

  const breakpointColumnsObj: { [key: number]: number; default: number } = {
    default: userColumns,
  };

  // Responsive behavior: reduce columns on smaller screens
  const lgColumns = Math.max(1, Math.min(userColumns, userColumns - 1));
  const mdColumns = Math.max(1, Math.min(userColumns, 2));
  const smColumns = 1;

  breakpointColumnsObj[parseInt(fullConfig.theme.screens.lg)] = lgColumns;
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.md)] = mdColumns;
  breakpointColumnsObj[parseInt(fullConfig.theme.screens.sm)] = smColumns;
  return breakpointColumnsObj;
}

export default function BookmarksGrid({
  bookmarks,
  hasNextPage = false,
  fetchNextPage = () => ({}),
  isFetchingNextPage = false,
  showEditorCard = false,
}: {
  bookmarks: ZBookmark[];
  showEditorCard?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
}) {
  const layout = useBookmarkLayout();
  const gridColumns = useGridColumns();
  const bulkActionsStore = useBulkActionsStore();
  const inBookmarkGrid = useInBookmarkGridStore();
  const withinListContext = useBookmarkListContext();
  const breakpointConfig = useMemo(
    () => getBreakpointConfig(gridColumns),
    [gridColumns],
  );
  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();

  useEffect(() => {
    bulkActionsStore.setVisibleBookmarks(bookmarks);
    bulkActionsStore.setListContext(withinListContext);

    return () => {
      bulkActionsStore.setVisibleBookmarks([]);
      bulkActionsStore.setListContext(undefined);
    };
  }, [bookmarks, withinListContext?.id]);

  useEffect(() => {
    inBookmarkGrid.setInBookmarkGrid(true);
    return () => {
      inBookmarkGrid.setInBookmarkGrid(false);
    };
  }, []);

  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [loadMoreButtonInView]);

  if (bookmarks.length == 0 && !showEditorCard) {
    return <NoBookmarksBanner />;
  }

  const children = [
    showEditorCard && (
      <StyledBookmarkCard key={"editor"}>
        <EditorCard />
      </StyledBookmarkCard>
    ),
    ...bookmarks.map((b) => (
      <ErrorBoundary key={b.id} fallback={<UnknownCard bookmark={b} />}>
        <StyledBookmarkCard>
          <BookmarkCard bookmark={b} />
        </StyledBookmarkCard>
      </ErrorBoundary>
    )),
  ];
  return (
    <>
      {bookmarkLayoutSwitch(layout, {
        masonry: (
          <Masonry className="flex gap-4" breakpointCols={breakpointConfig}>
            {children}
          </Masonry>
        ),
        grid: (
          <Masonry className="flex gap-4" breakpointCols={breakpointConfig}>
            {children}
          </Masonry>
        ),
        list: <div className="grid grid-cols-1">{children}</div>,
        compact: <div className="grid grid-cols-1">{children}</div>,
      })}
      {hasNextPage && (
        <div className="flex justify-center">
          <ActionButton
            ref={loadMoreRef}
            ignoreDemoMode={true}
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            variant="ghost"
          >
            Load More
          </ActionButton>
        </div>
      )}
    </>
  );
}
