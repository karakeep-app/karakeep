import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";

import { useTRPC } from "../trpc";

interface UseReadingProgressOptions {
  bookmarkId: string;
}

/**
 * Unified reading progress hook for web and mobile.
 *
 * Handles:
 * - Fetching reading progress via its own tRPC query
 * - Capturing initial reading position (stable across query re-fetches)
 * - "Continue reading" banner state and auto-dismiss on scroll past 15%
 * - Lazy saving via onSavePosition (idle, visibility change, unmount)
 * - Deduplication of save calls by offset
 *
 * Pass the returned `onSavePosition` and `onScrollPositionChange` to ScrollProgressTracker.
 */
export function useReadingProgress({ bookmarkId }: UseReadingProgressOptions) {
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { data: progressData } = useQuery(
    api.bookmarks.getReadingProgress.queryOptions({ bookmarkId }),
  );

  const readingProgressOffset = progressData?.readingProgressOffset;
  const readingProgressAnchor = progressData?.readingProgressAnchor;
  const readingProgressPercent = progressData?.readingProgressPercent;

  // Capture initial reading progress on first load — stays stable across re-fetches
  const initialProgressRef = useRef<{
    offset: number | null;
    anchor: string | null;
    percent: number | null;
  } | null>(null);
  const previousBookmarkIdRef = useRef<string | null>(null);
  const lastSavedOffset = useRef<number | null>(null);

  if (previousBookmarkIdRef.current !== bookmarkId) {
    previousBookmarkIdRef.current = bookmarkId;
    initialProgressRef.current = null;
    lastSavedOffset.current = null;
  }

  // Only capture once data has loaded (offset transitions from undefined to a value)
  if (!initialProgressRef.current && readingProgressOffset !== undefined) {
    initialProgressRef.current = {
      offset: readingProgressOffset ?? null,
      anchor: readingProgressAnchor ?? null,
      percent: readingProgressPercent ?? null,
    };
  }

  if (
    lastSavedOffset.current === null &&
    initialProgressRef.current?.offset != null
  ) {
    lastSavedOffset.current = initialProgressRef.current.offset;
  }

  const initialOffset = initialProgressRef.current?.offset ?? null;
  const initialAnchor = initialProgressRef.current?.anchor ?? null;
  const initialPercent = initialProgressRef.current?.percent ?? null;

  // Banner state
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [restoreRequested, setRestoreRequested] = useState(false);
  const showBanner =
    !!initialOffset &&
    initialOffset > 0 &&
    initialPercent != null &&
    initialPercent >= 10 &&
    initialPercent < 100 &&
    !bannerDismissed;

  const bannerVisibleRef = useRef(false);
  bannerVisibleRef.current = showBanner;

  useEffect(() => {
    setBannerDismissed(false);
    setRestoreRequested(false);
  }, [bookmarkId]);

  // Save mutation
  const { mutate: updateProgress } = useMutation(
    api.bookmarks.updateReadingProgress.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(
          api.bookmarks.getReadingProgress.pathFilter(),
        );
      },
    }),
  );

  // Lazy save — called by ScrollProgressTracker on idle/visibility/beforeunload/unmount
  const onSavePosition = useCallback(
    (position: ReadingPosition) => {
      if (bannerVisibleRef.current) return;
      if (lastSavedOffset.current === position.offset) return;
      lastSavedOffset.current = position.offset;
      updateProgress({
        bookmarkId,
        readingProgressOffset: position.offset,
        readingProgressAnchor: position.anchor,
        readingProgressPercent: position.percent,
      });
    },
    [bookmarkId, updateProgress],
  );

  // Responsive — called on every throttled scroll for banner dismissal
  const onScrollPositionChange = useCallback((position: ReadingPosition) => {
    if (bannerVisibleRef.current && position.percent > 15) {
      setBannerDismissed(true);
    }
  }, []);

  const onContinue = useCallback(() => {
    setRestoreRequested(true);
    setBannerDismissed(true);
  }, []);

  const onDismiss = useCallback(() => {
    setBannerDismissed(true);
  }, []);

  return {
    // Banner
    showBanner,
    bannerPercent: initialPercent,
    onContinue,
    onDismiss,
    // ScrollProgressTracker props
    restorePosition: restoreRequested,
    readingProgressOffset: initialOffset,
    readingProgressAnchor: initialAnchor,
    onSavePosition,
    onScrollPositionChange,
  };
}
