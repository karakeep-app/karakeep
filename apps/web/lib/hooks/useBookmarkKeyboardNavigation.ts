"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useBulkActionsStore from "@/lib/bulkActions";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  useDeleteBookmark,
  useUpdateBookmark,
} from "@karakeep/shared-react/hooks/bookmarks";
import { limitConcurrency } from "@karakeep/shared/concurrency";

import { useTranslation } from "../i18n/client";

const MAX_CONCURRENT_BULK_ACTIONS = 50;
const SEQUENCE_TIMEOUT_MS = 1000;

interface UseBookmarkKeyboardNavigationOptions {
  bookmarks: ZBookmark[];
  columns: number;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}

export function useBookmarkKeyboardNavigation({
  bookmarks,
  columns,
  hasNextPage,
  fetchNextPage,
}: UseBookmarkKeyboardNavigationOptions) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const {
    focusedIndex,
    isNavigating,
    shortcutsDialogOpen,
    moveBy,
    clearFocus,
    setFocusedIndex,
    setShortcutsDialogOpen,
  } = useKeyboardNavigationStore();
  const bulkActionsStore = useBulkActionsStore();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Track which bookmark ID the delete modal is for
  const modalBookmarkIdRef = useRef<string | null>(null);
  const selectionSequenceStartedAtRef = useRef<number | null>(null);
  const previousPathnameRef = useRef(pathname);

  const focusedBookmark =
    focusedIndex >= 0 && focusedIndex < bookmarks.length
      ? bookmarks[focusedIndex]
      : null;

  // Disable shortcuts when any modal is open or no bookmarks
  const anyModalOpen = shortcutsDialogOpen || deleteDialogOpen;
  const hasBookmarks = bookmarks.length > 0;
  const maxIndex = bookmarks.length - 1;

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    clearFocus();
    bulkActionsStore.setIsBulkEditEnabled(false);
    selectionSequenceStartedAtRef.current = null;
  }, [bulkActionsStore, clearFocus, pathname]);

  const getPendingSelectionSequence = useCallback(() => {
    const startedAt = selectionSequenceStartedAtRef.current;
    if (!startedAt || Date.now() - startedAt > SEQUENCE_TIMEOUT_MS) {
      selectionSequenceStartedAtRef.current = null;
      return false;
    }
    selectionSequenceStartedAtRef.current = null;
    return true;
  }, []);

  // Clamp focused index when bookmarks change
  useEffect(() => {
    if (isNavigating && focusedIndex >= bookmarks.length) {
      if (bookmarks.length === 0) {
        clearFocus();
      } else {
        setFocusedIndex(bookmarks.length - 1);
      }
    }
  }, [bookmarks.length]);

  // Scroll focused card into view
  useEffect(() => {
    if (focusedIndex >= 0 && isNavigating) {
      const el = document.querySelector(
        `[data-bookmark-index="${focusedIndex}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [focusedIndex, isNavigating]);

  // Auto-fetch next page when navigating to the last bookmark
  useEffect(() => {
    if (isNavigating && focusedIndex === bookmarks.length - 1 && hasNextPage) {
      fetchNextPage();
    }
  }, [focusedIndex, isNavigating, bookmarks.length, hasNextPage]);

  // Mutations
  const updateBookmarkMutator = useUpdateBookmark({
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });

  const deleteBookmarkMutator = useDeleteBookmark({
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });

  // Bulk mode: check if we have selected bookmarks
  const hasBulkSelection =
    bulkActionsStore.isBulkEditEnabled &&
    bulkActionsStore.selectedBookmarkIds.length > 0;

  const setBulkBookmarksToNextState = useCallback(
    async (field: "favourited" | "archived") => {
      const selectedBookmarkIds = new Set(bulkActionsStore.selectedBookmarkIds);
      const visibleBookmarks = bulkActionsStore.visibleBookmarks;
      const selected = visibleBookmarks.filter((bookmark) =>
        selectedBookmarkIds.has(bookmark.id),
      );
      const shouldEnable = !selected.every((bookmark) => bookmark[field]);
      const optimisticBookmarks = visibleBookmarks.map((bookmark) =>
        selectedBookmarkIds.has(bookmark.id)
          ? {
              ...bookmark,
              [field]: shouldEnable,
            }
          : bookmark,
      );
      bulkActionsStore.setVisibleBookmarks(optimisticBookmarks);
      try {
        const updatedBookmarks = await Promise.all(
          limitConcurrency(
            selected.map(
              (bookmark) => () =>
                updateBookmarkMutator.mutateAsync({
                  bookmarkId: bookmark.id,
                  [field]: shouldEnable,
                }),
            ),
            MAX_CONCURRENT_BULK_ACTIONS,
          ),
        );
        const updatedById = new Map(
          updatedBookmarks.map((bookmark) => [bookmark.id, bookmark]),
        );
        bulkActionsStore.setVisibleBookmarks(
          optimisticBookmarks.map(
            (bookmark) => updatedById.get(bookmark.id) ?? bookmark,
          ),
        );
        toast.success(t("toasts.bookmarks.updated"));
      } catch {
        bulkActionsStore.setVisibleBookmarks(visibleBookmarks);
      }
    },
    [
      bulkActionsStore,
      bulkActionsStore.selectedBookmarkIds,
      bulkActionsStore.visibleBookmarks,
      t,
      updateBookmarkMutator,
    ],
  );

  const selectAllBookmarks = useCallback(() => {
    if (!bulkActionsStore.isBulkEditEnabled) {
      bulkActionsStore.setIsBulkEditEnabled(true);
      // Re-set visible bookmarks since setIsBulkEditEnabled clears selection.
      bulkActionsStore.setVisibleBookmarks(bookmarks);
    }
    bulkActionsStore.selectAll();
  }, [bookmarks, bulkActionsStore]);

  useEffect(() => {
    const handleSelectionSequence = (event: KeyboardEvent) => {
      if (anyModalOpen || !getPendingSelectionSequence()) {
        return;
      }

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        event.stopPropagation();
        selectAllBookmarks();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopPropagation();
        bulkActionsStore.unSelectAll();
      }
    };

    window.addEventListener("keydown", handleSelectionSequence, true);
    return () => {
      window.removeEventListener("keydown", handleSelectionSequence, true);
    };
  }, [
    anyModalOpen,
    bulkActionsStore,
    getPendingSelectionSequence,
    selectAllBookmarks,
  ]);

  // Helper to check if focused bookmark action is valid
  const withFocusedBookmark = useCallback(
    (action: (bookmark: ZBookmark) => void) => {
      if (focusedBookmark) {
        action(focusedBookmark);
      }
    },
    [focusedBookmark],
  );

  // --- Navigation: h/j/k/l and arrow keys ---
  // h = left (prev item)
  useHotkeys(
    "h",
    () => moveBy(-1, maxIndex),
    {
      enabled: !anyModalOpen && hasBookmarks && columns > 1,
      preventDefault: true,
    },
    [columns, maxIndex, anyModalOpen],
  );

  useHotkeys(
    "left",
    () => moveBy(-1, maxIndex),
    {
      enabled: !anyModalOpen && hasBookmarks && isNavigating && columns > 1,
      preventDefault: true,
    },
    [columns, maxIndex, anyModalOpen, isNavigating],
  );

  // j = down (jump by column count)
  useHotkeys(
    "j",
    () => moveBy(columns, maxIndex),
    { enabled: !anyModalOpen && hasBookmarks, preventDefault: true },
    [columns, maxIndex, anyModalOpen],
  );

  useHotkeys(
    "down",
    () => moveBy(columns, maxIndex),
    {
      enabled: !anyModalOpen && hasBookmarks && isNavigating,
      preventDefault: true,
    },
    [columns, maxIndex, anyModalOpen, isNavigating],
  );

  // k = up (jump by column count)
  useHotkeys(
    "k",
    () => moveBy(-columns, maxIndex),
    { enabled: !anyModalOpen && hasBookmarks, preventDefault: true },
    [columns, maxIndex, anyModalOpen],
  );

  useHotkeys(
    "up",
    () => moveBy(-columns, maxIndex),
    {
      enabled: !anyModalOpen && hasBookmarks && isNavigating,
      preventDefault: true,
    },
    [columns, maxIndex, anyModalOpen, isNavigating],
  );

  // l = right (next item)
  useHotkeys(
    "l",
    () => moveBy(1, maxIndex),
    {
      enabled: !anyModalOpen && hasBookmarks && columns > 1,
      preventDefault: true,
    },
    [columns, maxIndex, anyModalOpen],
  );

  useHotkeys(
    "right",
    () => moveBy(1, maxIndex),
    {
      enabled: !anyModalOpen && hasBookmarks && isNavigating && columns > 1,
      preventDefault: true,
    },
    [columns, maxIndex, anyModalOpen, isNavigating],
  );

  // --- Open bookmark ---
  useHotkeys(
    "o",
    () => withFocusedBookmark((b) => router.push(`/dashboard/preview/${b.id}`)),
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [focusedBookmark, anyModalOpen],
  );

  useHotkeys(
    "enter",
    () => withFocusedBookmark((b) => router.push(`/dashboard/preview/${b.id}`)),
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [focusedBookmark, anyModalOpen],
  );

  // --- Favorite (f) ---
  // Bulk selection normalizes all selected bookmarks, then flips off if all match.
  useHotkeys(
    "f",
    () => {
      if (hasBulkSelection) {
        void setBulkBookmarksToNextState("favourited");
      } else {
        withFocusedBookmark((b) =>
          updateBookmarkMutator.mutate(
            {
              bookmarkId: b.id,
              favourited: !b.favourited,
            },
            {
              onSuccess: () => {
                toast.success(t("toasts.bookmarks.updated"));
              },
            },
          ),
        );
      }
    },
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [
      focusedBookmark,
      anyModalOpen,
      hasBulkSelection,
      setBulkBookmarksToNextState,
    ],
  );

  // --- Archive (a) ---
  // Bulk selection normalizes all selected bookmarks, then flips off if all match.
  useHotkeys(
    "a",
    () => {
      if (hasBulkSelection) {
        void setBulkBookmarksToNextState("archived");
      } else {
        withFocusedBookmark((b) =>
          updateBookmarkMutator.mutate(
            {
              bookmarkId: b.id,
              archived: !b.archived,
            },
            {
              onSuccess: () => {
                toast.success(t("toasts.bookmarks.updated"));
              },
            },
          ),
        );
      }
    },
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [
      focusedBookmark,
      anyModalOpen,
      hasBulkSelection,
      setBulkBookmarksToNextState,
      t,
      updateBookmarkMutator,
    ],
  );

  // --- Delete ---
  const openDeleteDialog = useCallback(() => {
    if (hasBulkSelection) {
      // Use null to signal bulk delete mode
      modalBookmarkIdRef.current = null;
      setDeleteDialogOpen(true);
    } else {
      withFocusedBookmark((b) => {
        modalBookmarkIdRef.current = b.id;
        setDeleteDialogOpen(true);
      });
    }
  }, [hasBulkSelection, withFocusedBookmark]);

  useHotkeys(
    "shift+3",
    openDeleteDialog,
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [focusedBookmark, anyModalOpen, hasBulkSelection],
  );

  useHotkeys(
    "delete",
    openDeleteDialog,
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [focusedBookmark, anyModalOpen, hasBulkSelection],
  );

  // --- Toggle selection (x) ---
  useHotkeys(
    "x",
    () =>
      withFocusedBookmark((b) => {
        if (!bulkActionsStore.isBulkEditEnabled) {
          bulkActionsStore.setIsBulkEditEnabled(true);
        }
        bulkActionsStore.toggleBookmark(b.id);
      }),
    { enabled: !anyModalOpen && isNavigating, preventDefault: true },
    [focusedBookmark, anyModalOpen, bulkActionsStore.isBulkEditEnabled],
  );

  // --- Help dialog (?) ---
  useHotkeys(
    "?",
    () => setShortcutsDialogOpen(true),
    { enabled: !anyModalOpen, preventDefault: true, useKey: true },
    [anyModalOpen],
  );

  // --- Escape: clear focus / exit bulk edit ---
  useHotkeys(
    "escape",
    () => {
      if (bulkActionsStore.isBulkEditEnabled) {
        bulkActionsStore.setIsBulkEditEnabled(false);
      } else {
        clearFocus();
      }
    },
    { enabled: !anyModalOpen },
    [anyModalOpen, bulkActionsStore.isBulkEditEnabled],
  );

  // --- Select all / Deselect all (* then a/n) ---
  useHotkeys(
    "shift+8",
    () => {
      selectionSequenceStartedAtRef.current = Date.now();
    },
    { enabled: !anyModalOpen && hasBookmarks, preventDefault: true },
    [anyModalOpen, hasBookmarks],
  );

  const isBulkDelete = deleteDialogOpen && modalBookmarkIdRef.current === null;
  const deleteCount = isBulkDelete
    ? bulkActionsStore.selectedBookmarkIds.length
    : 1;

  return {
    focusedIndex,
    isNavigating,
    helpDialogOpen: shortcutsDialogOpen,
    setHelpDialogOpen: setShortcutsDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    focusedBookmark,
    isBulkDelete,
    deleteCount,
    confirmDelete: () => {
      if (isBulkDelete) {
        void Promise.all(
          limitConcurrency(
            bulkActionsStore.selectedBookmarkIds.map(
              (bookmarkId) => () =>
                deleteBookmarkMutator.mutateAsync({ bookmarkId }),
            ),
            MAX_CONCURRENT_BULK_ACTIONS,
          ),
        ).then(() => {
          toast.success(t("toasts.bookmarks.deleted"));
          setDeleteDialogOpen(false);
          bulkActionsStore.setIsBulkEditEnabled(false);
        });
      } else if (modalBookmarkIdRef.current) {
        deleteBookmarkMutator.mutate(
          {
            bookmarkId: modalBookmarkIdRef.current,
          },
          {
            onSuccess: () => {
              toast.success(t("toasts.bookmarks.deleted"));
              setDeleteDialogOpen(false);
            },
          },
        );
      }
    },
    isDeletePending: deleteBookmarkMutator.isPending,
  };
}
