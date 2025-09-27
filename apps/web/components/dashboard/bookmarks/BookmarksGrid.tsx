import { forwardRef, useCallback, useEffect, useMemo } from "react";
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
import { MasonryVirtuoso, Virtuoso } from "react-virtuoso";
import resolveConfig from "tailwindcss/resolveConfig";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

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

type BookmarkGridItem =
  | { type: "editor" }
  | { type: "bookmark"; bookmark: ZBookmark };

const MasonryItem = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ children, style, className, ...props }, ref) => (
    <div
      {...props}
      ref={ref}
      style={style}
      className={[className, "px-2"].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  ),
);
MasonryItem.displayName = "MasonryItem";

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
  const breakpointConfig = useMemo(
    () => getBreakpointConfig(gridColumns),
    [gridColumns],
  );

  const items = useMemo<BookmarkGridItem[]>(() => {
    const baseItems = bookmarks.map<BookmarkGridItem>((bookmark) => ({
      type: "bookmark",
      bookmark,
    }));
    if (showEditorCard) {
      return [{ type: "editor" }, ...baseItems];
    }
    return baseItems;
  }, [bookmarks, showEditorCard]);

  const loadMoreFooter = useMemo(() => {
    if (!hasNextPage) {
      return null;
    }
    return (
      <div className="flex justify-center py-4">
        <ActionButton
          ignoreDemoMode={true}
          loading={isFetchingNextPage}
          onClick={() => fetchNextPage()}
          variant="ghost"
        >
          Load More
        </ActionButton>
      </div>
    );
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const getItemKey = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) {
        return `bookmark-${index}`;
      }
      return item.type === "editor" ? "editor" : item.bookmark.id;
    },
    [items],
  );

  const renderItem = useCallback((item: BookmarkGridItem | undefined) => {
    if (!item) {
      return null;
    }
    if (item.type === "editor") {
      return (
        <StyledBookmarkCard key="editor">
          <EditorCard />
        </StyledBookmarkCard>
      );
    }

    return (
      <ErrorBoundary
        key={item.bookmark.id}
        fallback={<UnknownCard bookmark={item.bookmark} />}
      >
        <StyledBookmarkCard>
          <BookmarkCard bookmark={item.bookmark} />
        </StyledBookmarkCard>
      </ErrorBoundary>
    );
  }, []);

  const columnsResolver = useMemo(() => {
    const entries = Object.entries(breakpointConfig)
      .filter(([key]) => key !== "default")
      .map(([key, value]) => ({
        breakpoint: Number.parseInt(key, 10),
        columns: value,
      }))
      .filter(({ breakpoint }) => !Number.isNaN(breakpoint))
      .sort((a, b) => a.breakpoint - b.breakpoint);

    return (width: number) => {
      for (const entry of entries) {
        if (width <= entry.breakpoint) {
          return entry.columns;
        }
      }
      return breakpointConfig.default;
    };
  }, [breakpointConfig]);

  useEffect(() => {
    bulkActionsStore.setVisibleBookmarks(bookmarks);
    return () => {
      bulkActionsStore.setVisibleBookmarks([]);
    };
  }, [bookmarks]);

  useEffect(() => {
    inBookmarkGrid.setInBookmarkGrid(true);
    return () => {
      inBookmarkGrid.setInBookmarkGrid(false);
    };
  }, []);

  if (items.length === 0 && !showEditorCard) {
    return <NoBookmarksBanner />;
  }

  return (
    <>
      {bookmarkLayoutSwitch(layout, {
        masonry: (
          <MasonryVirtuoso
            useWindowScroll
            totalCount={items.length}
            endReached={handleEndReached}
            overscan={500}
            computeItemKey={getItemKey}
            columns={columnsResolver}
            components={{
              Footer: () => loadMoreFooter,
              Item: MasonryItem,
            }}
            itemContent={(index) => renderItem(items[index])}
          />
        ),
        grid: (
          <MasonryVirtuoso
            useWindowScroll
            totalCount={items.length}
            endReached={handleEndReached}
            overscan={500}
            computeItemKey={getItemKey}
            columns={columnsResolver}
            components={{
              Footer: () => loadMoreFooter,
              Item: MasonryItem,
            }}
            itemContent={(index) => renderItem(items[index])}
          />
        ),
        list: (
          <Virtuoso
            useWindowScroll
            data={items}
            endReached={handleEndReached}
            overscan={500}
            computeItemKey={(index) => getItemKey(index)}
            components={{ Footer: () => loadMoreFooter }}
            itemContent={(index, item) => renderItem(item)}
          />
        ),
        compact: (
          <Virtuoso
            useWindowScroll
            data={items}
            endReached={handleEndReached}
            overscan={500}
            computeItemKey={(index) => getItemKey(index)}
            components={{ Footer: () => loadMoreFooter }}
            itemContent={(index, item) => renderItem(item)}
          />
        ),
      })}
    </>
  );
}
