"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";
import useBulkActionsStore from "@/lib/bulkActions";
import { useBookmarkBulkMutations } from "@/lib/hooks/useBookmarkBulkActions";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

import { useTranslation } from "../i18n/client";

const SEQUENCE_TIMEOUT_MS = 1000;

interface UseBookmarkKeyboardNavigationOptions {
  bookmarks: ZBookmark[];
  columns: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

type MoveBookmarkFocus = (offset: number, maxIndex: number) => void;

// Resolves whether the current session user can mutate a bookmark.
function useBookmarkOwnership() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  return useCallback(
    (bookmark: ZBookmark) => currentUserId === bookmark.userId,
    [currentUserId],
  );
}

// Provides guarded helpers for actions that require a focused bookmark.
function useFocusedBookmarkActions(
  focusedBookmark: ZBookmark | null,
  canMutateBookmark: (bookmark: ZBookmark) => boolean,
) {
  const withFocusedBookmark = useCallback(
    (action: (bookmark: ZBookmark) => void) => {
      if (focusedBookmark) {
        action(focusedBookmark);
      }
    },
    [focusedBookmark],
  );

  const withOwnedFocusedBookmark = useCallback(
    (action: (bookmark: ZBookmark) => void) => {
      if (focusedBookmark && canMutateBookmark(focusedBookmark)) {
        action(focusedBookmark);
      }
    },
    [canMutateBookmark, focusedBookmark],
  );

  return { withFocusedBookmark, withOwnedFocusedBookmark };
}

function useBookmarkMoveHotkey({
  keys,
  offset,
  enabled,
  maxIndex,
  moveBy,
}: {
  keys: string;
  offset: number;
  enabled: boolean;
  maxIndex: number;
  moveBy: MoveBookmarkFocus;
}) {
  useHotkeys(
    keys,
    () => moveBy(offset, maxIndex),
    { enabled, preventDefault: true },
    [enabled, maxIndex, moveBy, offset],
  );
}

// Owns keyboard focus movement, focused-card scrolling, and page fetching.
function useBookmarkFocusNavigation({
  bookmarks,
  columns,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  disabled,
}: UseBookmarkKeyboardNavigationOptions & { disabled: boolean }) {
  const { focusedIndex, isNavigating, moveBy, clearFocus, setFocusedIndex } =
    useKeyboardNavigationStore();

  const hasBookmarks = bookmarks.length > 0;
  const maxIndex = bookmarks.length - 1;
  const focusedBookmark =
    focusedIndex >= 0 && focusedIndex < bookmarks.length
      ? bookmarks[focusedIndex]
      : null;

  useEffect(() => {
    if (isNavigating && focusedIndex >= bookmarks.length) {
      if (bookmarks.length === 0) {
        clearFocus();
      } else {
        setFocusedIndex(bookmarks.length - 1);
      }
    }
  }, [
    bookmarks.length,
    clearFocus,
    focusedIndex,
    isNavigating,
    setFocusedIndex,
  ]);

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

  useEffect(() => {
    if (
      isNavigating &&
      focusedIndex === bookmarks.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    bookmarks.length,
    fetchNextPage,
    focusedIndex,
    hasNextPage,
    isFetchingNextPage,
    isNavigating,
  ]);

  const movementEnabled = !disabled && hasBookmarks;
  const horizontalMovementEnabled = movementEnabled && columns > 1;
  const arrowMovementEnabled = movementEnabled && isNavigating;
  const horizontalArrowMovementEnabled =
    horizontalMovementEnabled && isNavigating;

  useBookmarkMoveHotkey({
    keys: "h",
    offset: -1,
    enabled: horizontalMovementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "left",
    offset: -1,
    enabled: horizontalArrowMovementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "j",
    offset: columns,
    enabled: movementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "down",
    offset: columns,
    enabled: arrowMovementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "k",
    offset: -columns,
    enabled: movementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "up",
    offset: -columns,
    enabled: arrowMovementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "l",
    offset: 1,
    enabled: horizontalMovementEnabled,
    maxIndex,
    moveBy,
  });
  useBookmarkMoveHotkey({
    keys: "right",
    offset: 1,
    enabled: horizontalArrowMovementEnabled,
    maxIndex,
    moveBy,
  });

  return { focusedIndex, isNavigating, focusedBookmark, clearFocus };
}

// Owns bulk selection state changes and selection sequence hotkeys.
function useBulkBookmarkSelection({
  bookmarks,
  isNavigating,
  hasBookmarks,
  disabled,
  withFocusedBookmark,
  enableBulkEdit,
  selectBookmarks,
  toggleBookmark,
  unSelectAll,
}: {
  bookmarks: ZBookmark[];
  isNavigating: boolean;
  hasBookmarks: boolean;
  disabled: boolean;
  withFocusedBookmark: (action: (bookmark: ZBookmark) => void) => void;
  enableBulkEdit: () => void;
  selectBookmarks: (bookmarks: ZBookmark[]) => void;
  toggleBookmark: (bookmarkId: string) => void;
  unSelectAll: () => void;
}) {
  const selectionSequenceStartedAtRef = useRef<number | null>(null);

  const cancelSelectionSequence = useCallback(() => {
    selectionSequenceStartedAtRef.current = null;
  }, []);

  const getPendingSelectionSequence = useCallback(() => {
    const startedAt = selectionSequenceStartedAtRef.current;
    if (!startedAt || Date.now() - startedAt > SEQUENCE_TIMEOUT_MS) {
      selectionSequenceStartedAtRef.current = null;
      return false;
    }
    selectionSequenceStartedAtRef.current = null;
    return true;
  }, []);

  const selectAllBookmarks = useCallback(() => {
    selectBookmarks(bookmarks);
  }, [bookmarks, selectBookmarks]);

  useEffect(() => {
    const handleSelectionSequence = (event: KeyboardEvent) => {
      if (disabled || !getPendingSelectionSequence()) {
        return;
      }

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        event.stopPropagation();
        selectAllBookmarks();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        event.stopPropagation();
        unSelectAll();
      }
    };

    window.addEventListener("keydown", handleSelectionSequence, true);
    return () => {
      window.removeEventListener("keydown", handleSelectionSequence, true);
    };
  }, [disabled, getPendingSelectionSequence, selectAllBookmarks, unSelectAll]);

  useHotkeys(
    "x",
    () =>
      withFocusedBookmark((bookmark) => {
        enableBulkEdit();
        toggleBookmark(bookmark.id);
      }),
    { enabled: !disabled && isNavigating, preventDefault: true },
    [
      disabled,
      bookmarks,
      enableBulkEdit,
      isNavigating,
      toggleBookmark,
      withFocusedBookmark,
    ],
  );

  useHotkeys(
    "shift+8",
    () => {
      selectionSequenceStartedAtRef.current = Date.now();
    },
    { enabled: !disabled && hasBookmarks, preventDefault: true },
    [disabled, hasBookmarks],
  );

  return {
    cancelSelectionSequence,
  };
}

// Resets keyboard and bulk-selection state when dashboard navigation changes.
function useBookmarkRouteReset({
  clearFocus,
  cancelSelectionSequence,
}: {
  clearFocus: () => void;
  cancelSelectionSequence: () => void;
}) {
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const bulkActionsStore = useBulkActionsStore();

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;
    clearFocus();
    bulkActionsStore.setIsBulkEditEnabled(false);
    cancelSelectionSequence();
  }, [bulkActionsStore, cancelSelectionSequence, clearFocus, pathname]);
}

// Registers hotkeys that open the focused bookmark.
function useBookmarkOpenHotkeys({
  disabled,
  isNavigating,
  withFocusedBookmark,
}: {
  disabled: boolean;
  isNavigating: boolean;
  withFocusedBookmark: (action: (bookmark: ZBookmark) => void) => void;
}) {
  const router = useRouter();

  useHotkeys(
    "o,enter",
    () =>
      withFocusedBookmark((bookmark) =>
        router.push(`/dashboard/preview/${bookmark.id}`),
      ),
    { enabled: !disabled && isNavigating, preventDefault: true },
    [disabled, isNavigating, router, withFocusedBookmark],
  );
}

// Registers favorite and archive hotkeys for focused or selected bookmarks.
function useBookmarkUpdateHotkeys({
  disabled,
  hasBulkSelection,
  isNavigating,
  setSelectedBookmarksToNextState,
  updateBookmarkMutator,
  withOwnedFocusedBookmark,
}: {
  disabled: boolean;
  hasBulkSelection: boolean;
  isNavigating: boolean;
  setSelectedBookmarksToNextState: (
    field: "favourited" | "archived",
  ) => Promise<ZBookmark[]>;
  updateBookmarkMutator: ReturnType<
    typeof useBookmarkBulkMutations
  >["updateBookmarkMutator"];
  withOwnedFocusedBookmark: (action: (bookmark: ZBookmark) => void) => void;
}) {
  const { t } = useTranslation();

  useHotkeys(
    "f",
    () => {
      if (hasBulkSelection) {
        void setSelectedBookmarksToNextState("favourited")
          .then(() => {
            toast.success(t("toasts.bookmarks.updated"));
          })
          .catch(() => undefined);
      } else {
        withOwnedFocusedBookmark((bookmark) =>
          updateBookmarkMutator.mutate(
            {
              bookmarkId: bookmark.id,
              favourited: !bookmark.favourited,
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
    { enabled: !disabled && isNavigating, preventDefault: true },
    [
      disabled,
      hasBulkSelection,
      isNavigating,
      setSelectedBookmarksToNextState,
      t,
      updateBookmarkMutator,
      withOwnedFocusedBookmark,
    ],
  );

  useHotkeys(
    "a",
    () => {
      if (hasBulkSelection) {
        void setSelectedBookmarksToNextState("archived")
          .then(() => {
            toast.success(t("toasts.bookmarks.updated"));
          })
          .catch(() => undefined);
      } else {
        withOwnedFocusedBookmark((bookmark) =>
          updateBookmarkMutator.mutate(
            {
              bookmarkId: bookmark.id,
              archived: !bookmark.archived,
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
    { enabled: !disabled && isNavigating, preventDefault: true },
    [
      disabled,
      hasBulkSelection,
      isNavigating,
      setSelectedBookmarksToNextState,
      t,
      updateBookmarkMutator,
      withOwnedFocusedBookmark,
    ],
  );
}

// Owns delete hotkeys, delete dialog state, and delete confirmation behavior.
function useBookmarkDeleteHotkeys({
  disabled,
  deleteDialogOpen,
  hasBulkSelection,
  isNavigating,
  deleteBookmarkMutator,
  deleteSelectedBookmarksSettled,
  selectedOwnedBookmarks,
  setDeleteDialogOpen,
  withOwnedFocusedBookmark,
}: {
  disabled: boolean;
  deleteDialogOpen: boolean;
  hasBulkSelection: boolean;
  isNavigating: boolean;
  deleteBookmarkMutator: ReturnType<
    typeof useBookmarkBulkMutations
  >["deleteBookmarkMutator"];
  deleteSelectedBookmarksSettled: ReturnType<
    typeof useBookmarkBulkMutations
  >["deleteSelectedBookmarksSettled"];
  selectedOwnedBookmarks: () => ZBookmark[];
  setDeleteDialogOpen: (open: boolean) => void;
  withOwnedFocusedBookmark: (action: (bookmark: ZBookmark) => void) => void;
}) {
  const { t } = useTranslation();
  const bulkActionsStore = useBulkActionsStore();
  const [isBulkDeletePending, setIsBulkDeletePending] = useState(false);
  const modalBookmarkIdRef = useRef<string | null>(null);

  const openDeleteDialog = useCallback(() => {
    if (hasBulkSelection) {
      if (selectedOwnedBookmarks().length === 0) {
        return;
      }
      modalBookmarkIdRef.current = null;
      setDeleteDialogOpen(true);
    } else {
      withOwnedFocusedBookmark((bookmark) => {
        modalBookmarkIdRef.current = bookmark.id;
        setDeleteDialogOpen(true);
      });
    }
  }, [
    hasBulkSelection,
    selectedOwnedBookmarks,
    setDeleteDialogOpen,
    withOwnedFocusedBookmark,
  ]);

  useHotkeys(
    "shift+3,delete",
    openDeleteDialog,
    { enabled: !disabled && isNavigating, preventDefault: true },
    [disabled, hasBulkSelection, isNavigating, openDeleteDialog],
  );

  const isBulkDelete = deleteDialogOpen && modalBookmarkIdRef.current === null;
  const deleteCount = isBulkDelete ? selectedOwnedBookmarks().length : 1;

  const confirmDelete = useCallback(async () => {
    if (isBulkDelete) {
      setIsBulkDeletePending(true);
      const results = await deleteSelectedBookmarksSettled();
      const deletedCount = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failedCount = results.length - deletedCount;
      if (deletedCount > 0) {
        toast.success(t("toasts.bookmarks.deleted"));
      }
      if (failedCount > 0) {
        toast.error(t("common.something_went_wrong"));
      }
      setIsBulkDeletePending(false);
      if (failedCount === 0) {
        setDeleteDialogOpen(false);
        bulkActionsStore.setIsBulkEditEnabled(false);
      }
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
  }, [
    bulkActionsStore,
    deleteBookmarkMutator,
    deleteSelectedBookmarksSettled,
    isBulkDelete,
    t,
  ]);

  return {
    deleteDialogOpen,
    setDeleteDialogOpen,
    isBulkDelete,
    deleteCount,
    confirmDelete,
    isDeletePending: deleteBookmarkMutator.isPending || isBulkDeletePending,
  };
}

// Registers global bookmark-grid hotkeys that are not tied to one bookmark.
function useBookmarkGlobalHotkeys({
  disabled,
  clearFocus,
}: {
  disabled: boolean;
  clearFocus: () => void;
}) {
  const { shortcutsDialogOpen, setShortcutsDialogOpen } =
    useKeyboardNavigationStore();
  const bulkActionsStore = useBulkActionsStore();

  useHotkeys(
    "?",
    () => setShortcutsDialogOpen(true),
    { enabled: !disabled, preventDefault: true, useKey: true },
    [disabled],
  );

  useHotkeys(
    "escape",
    () => {
      if (bulkActionsStore.isBulkEditEnabled) {
        bulkActionsStore.setIsBulkEditEnabled(false);
      } else {
        clearFocus();
      }
    },
    { enabled: !disabled },
    [disabled, bulkActionsStore.isBulkEditEnabled],
  );

  return {
    helpDialogOpen: shortcutsDialogOpen,
    setHelpDialogOpen: setShortcutsDialogOpen,
  };
}

// Composes the bookmark keyboard workflows behind the existing public API.
export function useBookmarkKeyboardNavigation({
  bookmarks,
  columns,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: UseBookmarkKeyboardNavigationOptions) {
  const { t } = useTranslation();
  const shortcutsDialogOpen = useKeyboardNavigationStore(
    (state) => state.shortcutsDialogOpen,
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const disabled = shortcutsDialogOpen || deleteDialogOpen;
  const hasBookmarks = bookmarks.length > 0;
  const canMutateBookmark = useBookmarkOwnership();
  const bulkActionsStore = useBulkActionsStore();
  const selectedBookmarks = bulkActionsStore.getSelectedBookmarks();
  const { isBulkEditEnabled } = bulkActionsStore;
  const selectedActionableBookmarks = useCallback(
    () => bulkActionsStore.getSelectedActionableBookmarks(canMutateBookmark),
    [bulkActionsStore, canMutateBookmark],
  );
  const hasBulkSelection =
    isBulkEditEnabled && selectedActionableBookmarks().length > 0;
  const enableBulkEdit = useCallback(() => {
    bulkActionsStore.setIsBulkEditEnabled(true);
  }, [bulkActionsStore]);
  const selectBookmarks = useCallback(
    (bookmarks: ZBookmark[]) => {
      enableBulkEdit();
      bulkActionsStore.setSelectedBookmarkIds(
        bookmarks.map((bookmark) => bookmark.id),
      );
    },
    [bulkActionsStore, enableBulkEdit],
  );
  const {
    updateBookmarkMutator,
    deleteBookmarkMutator,
    setSelectedBookmarksToNextState,
    deleteSelectedBookmarksSettled,
  } = useBookmarkBulkMutations({
    selectedBookmarks,
    selectedActionableBookmarks,
    onError: () => {
      toast.error(t("common.something_went_wrong"));
    },
  });

  const focusNavigation = useBookmarkFocusNavigation({
    bookmarks,
    columns,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    disabled,
  });

  const { withFocusedBookmark, withOwnedFocusedBookmark } =
    useFocusedBookmarkActions(
      focusNavigation.focusedBookmark,
      canMutateBookmark,
    );

  const bulkSelection = useBulkBookmarkSelection({
    bookmarks,
    isNavigating: focusNavigation.isNavigating,
    hasBookmarks,
    disabled,
    withFocusedBookmark,
    enableBulkEdit,
    selectBookmarks,
    toggleBookmark: bulkActionsStore.toggleBookmark,
    unSelectAll: bulkActionsStore.unSelectAll,
  });

  useBookmarkRouteReset({
    clearFocus: focusNavigation.clearFocus,
    cancelSelectionSequence: bulkSelection.cancelSelectionSequence,
  });

  useBookmarkOpenHotkeys({
    disabled,
    isNavigating: focusNavigation.isNavigating,
    withFocusedBookmark,
  });

  useBookmarkUpdateHotkeys({
    disabled,
    hasBulkSelection,
    isNavigating: focusNavigation.isNavigating,
    setSelectedBookmarksToNextState,
    updateBookmarkMutator,
    withOwnedFocusedBookmark,
  });

  const deletion = useBookmarkDeleteHotkeys({
    disabled,
    deleteDialogOpen,
    hasBulkSelection,
    isNavigating: focusNavigation.isNavigating,
    deleteBookmarkMutator,
    deleteSelectedBookmarksSettled,
    selectedOwnedBookmarks: selectedActionableBookmarks,
    setDeleteDialogOpen,
    withOwnedFocusedBookmark,
  });

  const globalHotkeys = useBookmarkGlobalHotkeys({
    disabled,
    clearFocus: focusNavigation.clearFocus,
  });

  return {
    focusedIndex: focusNavigation.focusedIndex,
    isNavigating: focusNavigation.isNavigating,
    helpDialogOpen: globalHotkeys.helpDialogOpen,
    setHelpDialogOpen: globalHotkeys.setHelpDialogOpen,
    deleteDialogOpen: deletion.deleteDialogOpen,
    setDeleteDialogOpen: deletion.setDeleteDialogOpen,
    focusedBookmark: focusNavigation.focusedBookmark,
    isBulkDelete: deletion.isBulkDelete,
    deleteCount: deletion.deleteCount,
    confirmDelete: deletion.confirmDelete,
    isDeletePending: deletion.isDeletePending,
  };
}
