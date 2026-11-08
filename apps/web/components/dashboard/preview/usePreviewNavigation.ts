import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useBulkActionsStore from "@/lib/bulkActions";
import { useKeyboardNavigationStore } from "@/lib/store/useKeyboardNavigationStore";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";

export interface PreviewNavigation {
  onPrevious?: () => void;
  onNext?: () => void;
}

function cardSelector(index: number) {
  return `[data-bookmark-index="${index}"]`;
}

/** Anything layered over the preview that keeps the keyboard while it's open. */
const OVERLAY_SELECTOR =
  "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], [data-radix-popper-content-wrapper]";

export function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Moves the preview modal between the bookmarks of the grid behind it, and hands
 * keyboard focus back to the grid on close. The grid stays mounted under the
 * modal, and publishes its loaded bookmarks to the bulk actions store.
 */
export function usePreviewNavigation({
  bookmarkId,
  containerRef,
}: {
  bookmarkId: string;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const bookmarks = useBulkActionsStore((state) => state.visibleBookmarks);

  // Read before the commit that clears it: the grid drops its keyboard focus on
  // every pathname change, which includes the one that opened this modal.
  const [openedWithKeyboard] = useState(
    () => useKeyboardNavigationStore.getState().isNavigating,
  );

  const currentIndex = bookmarks.findIndex((b) => b.id === bookmarkId);
  // Archiving or deleting from the preview can drop the bookmark from the grid.
  // Remember its position, so that next and previous still work from there.
  const lastIndexRef = useRef(currentIndex);
  const movedRef = useRef(false);
  useEffect(() => {
    if (currentIndex >= 0) {
      lastIndexRef.current = currentIndex;
    }
  }, [currentIndex]);

  const isInGrid = currentIndex >= 0 || lastIndexRef.current >= 0;
  const position = currentIndex >= 0 ? currentIndex : lastIndexRef.current;
  const previous: ZBookmark | undefined = isInGrid
    ? bookmarks[position - 1]
    : undefined;
  const next: ZBookmark | undefined = isInGrid
    ? bookmarks[currentIndex >= 0 ? position + 1 : position]
    : undefined;

  const goTo = useCallback(
    (target: ZBookmark | undefined) => {
      if (!target) {
        return;
      }
      movedRef.current = true;
      // Replaces rather than pushes, so that closing goes back to the grid. The
      // dialog is in the layout above this page, so it stays open.
      router.replace(`/dashboard/preview/${target.id}`, { scroll: false });
      const index = useBulkActionsStore
        .getState()
        .visibleBookmarks.findIndex((b) => b.id === target.id);
      // Keeps the grid in step under the modal. This also brings its "Load More"
      // into view near the end of the list, which is what fetches the next page.
      document
        .querySelector(cardSelector(index))
        ?.scrollIntoView({ block: "center" });
    },
    [router],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
        return;
      }
      const key = e.key.toLowerCase();
      if (!["j", "k", "h", "l"].includes(key) || isEditable(e.target)) {
        return;
      }
      // Dialogs, menus and popovers opened from the preview keep the keyboard
      // while they're open. Focus anywhere else still moves the preview, even
      // where the mouse left it: on the card that opened this, say.
      const overlay = document.activeElement?.closest(OVERLAY_SELECTOR);
      if (overlay && overlay !== containerRef.current) {
        return;
      }
      // The grid's own hotkeys are still live behind the modal. Letting these
      // through would move its focus, and with it arm its f, a and # shortcuts
      // on a bookmark that's hidden behind the preview.
      e.stopPropagation();
      e.preventDefault();
      if (key === "j") {
        goTo(next);
      } else if (key === "k") {
        goTo(previous);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [containerRef, goTo, next, previous]);

  // Restore the grid's keyboard focus on the way out. It has to wait a frame, as
  // the grid clears its focus in an effect of the same commit that unmounts this.
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (!openedWithKeyboard && !movedRef.current) {
        return;
      }
      const index = lastIndexRef.current;
      requestAnimationFrame(() => {
        // Strict mode runs this cleanup without really unmounting.
        if (isMountedRef.current || index < 0) {
          return;
        }
        useKeyboardNavigationStore.getState().setFocusedIndex(index);
        document
          .querySelector<HTMLElement>(
            `${cardSelector(index)} a[href^="/dashboard/preview/"]`,
          )
          ?.focus({ preventScroll: true });
      });
    };
  }, [openedWithKeyboard]);

  const placeholder = currentIndex >= 0 ? bookmarks[currentIndex] : undefined;

  // Whether closing hands focus to the grid's current card (see above), in place
  // of the dialog returning it to the card that opened it.
  const restoresFocusOnClose = useCallback(
    () => openedWithKeyboard || movedRef.current,
    [openedWithKeyboard],
  );

  return {
    placeholder,
    restoresFocusOnClose,
    navigation: isInGrid
      ? ({
          onPrevious: previous ? () => goTo(previous) : undefined,
          onNext: next ? () => goTo(next) : undefined,
        } satisfies PreviewNavigation)
      : undefined,
  };
}
