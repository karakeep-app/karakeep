import { memo, useCallback, useEffect, useMemo, useState } from "react";
import KeyboardShortcutsDialog from "@/components/dashboard/KeyboardShortcutsDialog";
import NoBookmarksBanner from "@/components/dashboard/bookmarks/NoBookmarksBanner";
import { ActionButton } from "@/components/ui/action-button";
import ActionConfirmingDialog from "@/components/ui/action-confirming-dialog";
import useBulkActionsStore from "@/lib/bulkActions";
import { useBookmarkKeyboardNavigation } from "@/lib/hooks/useBookmarkKeyboardNavigation";
import { useTranslation } from "@/lib/i18n/client";
import { useInBookmarkGridStore } from "@/lib/store/useInBookmarkGridStore";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import {
  bookmarkLayoutSwitch,
  useBookmarkLayout,
  useGridColumns,
} from "@/lib/userLocalSettings/bookmarksLayout";
import { cn } from "@/lib/utils";
import tailwindConfig from "@/tailwind.config";
import { Slot } from "@radix-ui/react-slot";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { useInView } from "react-intersection-observer";
import Masonry from "react-masonry-css";
import resolveConfig from "tailwindcss/resolveConfig";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { useBookmarkListContext } from "@karakeep/shared-react/hooks/bookmark-list-context";
import { useCreateBookmarkWithPostHook } from "@karakeep/shared-react/hooks/bookmarks";
import { useTRPC } from "@karakeep/shared-react/trpc";
import type { BookmarkMergeDragContextValue } from "./BookmarkMergeDragContext";
import { BookmarkMergeDragProvider } from "./BookmarkMergeDragContext";

import BookmarkCard from "./BookmarkCard";
import EditorCard from "./EditorCard";
import UnknownCard from "./UnknownCard";
import { toast } from "@/components/ui/sonner";
function StyledBookmarkCard({
  children,
  className,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Slot
      className={cn(
        "mb-4 border border-border bg-card hover:shadow-lg hover:transition-shadow",
        className,
      )}
      {...props}
    >
      {children}
    </Slot>
  );
}

const BookmarkGridItem = memo(function BookmarkGridItem({
  bookmark,
  index,
}: {
  bookmark: ZBookmark;
  index: number;
}) {
  const isFocused = useKeyboardNavigationStore(
    (state) => state.isNavigating && state.focusedIndex === index,
  );

  return (
    <ErrorBoundary fallback={<UnknownCard bookmark={bookmark} />}>
      <StyledBookmarkCard
        className={cn(
          isFocused &&
            "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <BookmarkCard bookmark={bookmark} bookmarkIndex={index} />
      </StyledBookmarkCard>
    </ErrorBoundary>
  );
});

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

function getColumnsForViewport(userColumns: number, viewportWidth: number) {
  const fullConfig = resolveConfig(tailwindConfig);
  const screens = fullConfig.theme.screens;
  const lg = parseInt(screens.lg);
  const md = parseInt(screens.md);
  const sm = parseInt(screens.sm);

  if (viewportWidth <= sm) {
    return 1;
  }
  if (viewportWidth <= md) {
    return Math.max(1, Math.min(userColumns, 2));
  }
  if (viewportWidth <= lg) {
    return Math.max(1, userColumns - 1);
  }
  return userColumns;
}

function useActiveGridColumns(userColumns: number) {
  const [activeColumns, setActiveColumns] = useState(userColumns);

  useEffect(() => {
    let animationFrame: number | null = null;
    const updateActiveColumns = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        setActiveColumns(getColumnsForViewport(userColumns, window.innerWidth));
      });
    };

    const updateActiveColumnsImmediately = () => {
      setActiveColumns(getColumnsForViewport(userColumns, window.innerWidth));
    };

    updateActiveColumnsImmediately();
    window.addEventListener("resize", updateActiveColumns);
    return () => {
      window.removeEventListener("resize", updateActiveColumns);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [userColumns]);

  return activeColumns;
}
interface PendingBookmarkMerge {
  sourceId: string;
  targetId: string;
}
function isMergeEligibleBookmark(bookmark: ZBookmark | undefined) {
  return (
    bookmark?.content.type === BookmarkTypes.ASSET &&
    bookmark.content.assetType === "image"
  );
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
  const { t } = useTranslation();
  const api = useTRPC();
  const queryClient = useQueryClient();

  const layout = useBookmarkLayout();
  const gridColumns = useGridColumns();
  const activeGridColumns = useActiveGridColumns(gridColumns);
  const setVisibleBookmarks = useBulkActionsStore(
    (state) => state.setVisibleBookmarks,
  );
  const setListContext = useBulkActionsStore((state) => state.setListContext);
  const setInBookmarkGrid = useInBookmarkGridStore(
    (state) => state.setInBookmarkGrid,
  );
  const withinListContext = useBookmarkListContext();
  const breakpointConfig = useMemo(
    () => getBreakpointConfig(gridColumns),
    [gridColumns],
  );
  const { ref: loadMoreRef, inView: loadMoreButtonInView } = useInView();

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  // Keep the dropped bookmark pair while waiting for merge confirmation.
  const [pendingMerge, setPendingMerge] = useState<PendingBookmarkMerge | null>(
    null,
  );
  // Send the confirmed merge request and keep the dialog open if it fails.
  const { mutate: createMergeCollection, isPending: isCreatingCollection } =
    useCreateBookmarkWithPostHook({
      onSuccess: () => {
        setPendingMerge(null);
      },
      onError: (error) => {
        toast({
          description: error.message,
          variant: "destructive",
        });
      },
    });
  const { mutate: appendImage, isPending: isAppendingImage } = useMutation(
    api.bookmarks.addImageCollectionItem.mutationOptions({
      onSuccess: (_result, input) => {
        queryClient.invalidateQueries(
          api.bookmarks.getBookmark.queryFilter({
            bookmarkId: input.bookmarkId,
          }),
        );
        queryClient.invalidateQueries(api.bookmarks.getBookmarks.pathFilter());
        queryClient.invalidateQueries(
          api.bookmarks.searchBookmarks.pathFilter(),
        );
        setPendingMerge(null);
      },
      onError: (error) => {
        toast({ description: error.message, variant: "destructive" });
      },
    }),
  );
  const isMergePending = isCreatingCollection || isAppendingImage;
  // For list/compact layouts, navigation is single-column
  const isListLayout = layout === "list" || layout === "compact";
  const navColumns = isListLayout ? 1 : activeGridColumns;

  const {
    helpDialogOpen,
    setHelpDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    isBulkDelete,
    deleteCount,
    confirmDelete,
    isDeletePending,
  } = useBookmarkKeyboardNavigation({
    bookmarks,
    columns: navColumns,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const findBookmarkById = useCallback(
    (bookmarkId: string) =>
      bookmarks.find((bookmark) => bookmark.id === bookmarkId),
    [bookmarks],
  );

  const handleBookmarkDragStart = useCallback(
    (bookmarkId: string) => {
      const bookmark = findBookmarkById(bookmarkId);

      if (!isMergeEligibleBookmark(bookmark)) {
        setActiveSourceId(null);
        return;
      }

      setActiveSourceId(bookmarkId);
      setActiveTargetId(null);
    },
    [findBookmarkById],
  );

  const handleBookmarkDragEnd = useCallback(() => {
    setActiveSourceId(null);
    setActiveTargetId(null);
  }, []);

  const isValidMergeTarget = useCallback(
    (bookmarkId: string) => {
      if (!activeSourceId || activeSourceId === bookmarkId) {
        return false;
      }

      const source = findBookmarkById(activeSourceId);
      const target = findBookmarkById(bookmarkId);

      return (
        isMergeEligibleBookmark(source) &&
        (isMergeEligibleBookmark(target) ||
          target?.content.type === BookmarkTypes.COLLECTION)
      );
    },
    [activeSourceId, findBookmarkById],
  );

  const handleBookmarkTargetEnter = useCallback(
    (bookmarkId: string) => {
      if (isValidMergeTarget(bookmarkId)) {
        setActiveTargetId(bookmarkId);
      } else {
        setActiveTargetId(null);
      }
    },
    [isValidMergeTarget],
  );

  const handleBookmarkTargetLeave = useCallback((bookmarkId: string) => {
    setActiveTargetId((currentTargetId) =>
      currentTargetId === bookmarkId ? null : currentTargetId,
    );
  }, []);

  const handleBookmarkDrop = useCallback(
    (transferredSourceId: string, targetBookmarkId: string) => {
      if (
        transferredSourceId !== activeSourceId ||
        !isValidMergeTarget(targetBookmarkId)
      ) {
        setActiveSourceId(null);
        setActiveTargetId(null);
        return;
      }
      // Keep the valid bookmark pair for merge confirmation.
      setPendingMerge({
        sourceId: transferredSourceId,
        targetId: targetBookmarkId,
      });

      setActiveSourceId(null);
      setActiveTargetId(null);
    },
    [activeSourceId, isValidMergeTarget],
  );
  // Clear the pending merge when the confirmation dialog closes.
  const handleMergeDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPendingMerge(null);
    }
  }, []);
  // Append to an existing collection or create one after confirmation.
  const handleMergeConfirm = useCallback(() => {
    if (!pendingMerge || isMergePending) {
      return;
    }

    const target = findBookmarkById(pendingMerge.targetId);
    if (target?.content.type === BookmarkTypes.COLLECTION) {
      appendImage({
        bookmarkId: target.id,
        itemBookmarkId: pendingMerge.sourceId,
      });
      return;
    }

    createMergeCollection({
      type: BookmarkTypes.COLLECTION,
      bookmarkIds: [pendingMerge.sourceId, pendingMerge.targetId],
    });
  }, [
    appendImage,
    createMergeCollection,
    findBookmarkById,
    isMergePending,
    pendingMerge,
  ]);

  const bookmarkMergeDragContextValue = useMemo<BookmarkMergeDragContextValue>(
    () => ({
      activeSourceId,
      activeTargetId,
      onBookmarkDragStart: handleBookmarkDragStart,
      onBookmarkDragEnd: handleBookmarkDragEnd,
      isValidMergeTarget,
      onBookmarkTargetEnter: handleBookmarkTargetEnter,
      onBookmarkTargetLeave: handleBookmarkTargetLeave,
      onBookmarkDrop: handleBookmarkDrop,
    }),
    [
      activeSourceId,
      activeTargetId,
      handleBookmarkDragStart,
      handleBookmarkDragEnd,
      isValidMergeTarget,
      handleBookmarkTargetEnter,
      handleBookmarkTargetLeave,
      handleBookmarkDrop,
    ],
  );

  useEffect(() => {
    setVisibleBookmarks(bookmarks);
    setListContext(withinListContext);

    return () => {
      setVisibleBookmarks([]);
      setListContext(undefined);
    };
  }, [bookmarks, setListContext, setVisibleBookmarks, withinListContext]);

  useEffect(() => {
    setInBookmarkGrid(true);
    return () => {
      setInBookmarkGrid(false);
    };
  }, [setInBookmarkGrid]);

  useEffect(() => {
    if (loadMoreButtonInView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, loadMoreButtonInView]);

  if (bookmarks.length == 0 && !showEditorCard) {
    return (
      <>
        <NoBookmarksBanner />
        <KeyboardShortcutsDialog
          open={helpDialogOpen}
          setOpen={setHelpDialogOpen}
        />
      </>
    );
  }

  const children = [
    showEditorCard && (
      <StyledBookmarkCard key={"editor"}>
        <EditorCard />
      </StyledBookmarkCard>
    ),
    ...bookmarks.map((bookmark, index) => (
      <BookmarkGridItem key={bookmark.id} bookmark={bookmark} index={index} />
    )),
  ];

  return (
    <BookmarkMergeDragProvider value={bookmarkMergeDragContextValue}>
      <>
        {bookmarkLayoutSwitch(layout, {
          masonry: (
            <Masonry
              className="-ml-4 flex w-auto"
              columnClassName="pl-4"
              breakpointCols={breakpointConfig}
            >
              {children}
            </Masonry>
          ),
          grid: (
            <Masonry
              className="-ml-4 flex w-auto"
              columnClassName="pl-4"
              breakpointCols={breakpointConfig}
            >
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

        <KeyboardShortcutsDialog
          open={helpDialogOpen}
          setOpen={setHelpDialogOpen}
        />
        <ActionConfirmingDialog
          open={!!pendingMerge}
          setOpen={handleMergeDialogOpenChange}
          title={t("dialogs.bookmarks.merge_confirmation_title")}
          description={t("dialogs.bookmarks.merge_confirmation_description")}
          actionButton={() => (
            <ActionButton
              type="button"
              loading={isMergePending}
              onClick={handleMergeConfirm}
            >
              {t("actions.merge")}
            </ActionButton>
          )}
        />
        <ActionConfirmingDialog
          open={deleteDialogOpen}
          setOpen={setDeleteDialogOpen}
          title={t("dialogs.bookmarks.delete_confirmation_title")}
          description={
            isBulkDelete
              ? t("dialogs.bookmarks.bulk_delete_confirmation_description", {
                  count: deleteCount,
                })
              : t("dialogs.bookmarks.delete_confirmation_description")
          }
          actionButton={() => (
            <ActionButton
              type="button"
              variant="destructive"
              loading={isDeletePending}
              onClick={confirmDelete}
            >
              {t("actions.delete")}
            </ActionButton>
          )}
        />
      </>
    </BookmarkMergeDragProvider>
  );
}
