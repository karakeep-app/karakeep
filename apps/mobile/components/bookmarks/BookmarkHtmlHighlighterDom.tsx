"use dom";

import "@/globals.css";

import { useEffect, useRef } from "react";

import type { Highlight } from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import {
  findScrollableParent,
  getReadingPosition,
  SCROLL_THROTTLE_MS,
  scrollToReadingPosition,
} from "@karakeep/shared/utils/reading-progress-dom";

export default function BookmarkHtmlHighlighterDom({
  htmlContent,
  contentStyle,
  highlights,
  readOnly,
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  readingProgressOffset,
  readingProgressAnchor,
  restoreReadingPosition,
  onScrollProgress,
}: {
  htmlContent: string;
  contentStyle?: React.CSSProperties;
  highlights?: Highlight[];
  readOnly?: boolean;
  onHighlight?: (highlight: Highlight) => void;
  onUpdateHighlight?: (highlight: Highlight) => void;
  onDeleteHighlight?: (highlight: Highlight) => void;
  readingProgressOffset?: number | null;
  readingProgressAnchor?: string | null;
  restoreReadingPosition?: boolean;
  onScrollProgress?: (position: {
    offset: number;
    anchor: string;
    percent: number;
  }) => void;
  dom?: import("expo/dom").DOMProps;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const onScrollProgressRef = useRef(onScrollProgress);
  useEffect(() => {
    onScrollProgressRef.current = onScrollProgress;
  });

  // Restore position when triggered by native side
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (
      !restoreReadingPosition ||
      hasRestoredRef.current ||
      !readingProgressOffset ||
      readingProgressOffset <= 0
    )
      return;

    hasRestoredRef.current = true;
    const rafId = requestAnimationFrame(() => {
      const container = contentRef.current;
      if (!container) return;

      scrollToReadingPosition(
        container,
        readingProgressOffset,
        "smooth",
        readingProgressAnchor,
      );
    });

    return () => cancelAnimationFrame(rafId);
  }, [restoreReadingPosition, readingProgressOffset, readingProgressAnchor]);

  // Scroll tracking
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    let lastScrollTime = 0;

    const handleScroll = () => {
      const now = Date.now();
      if (now - lastScrollTime < SCROLL_THROTTLE_MS) return;
      lastScrollTime = now;

      const position = getReadingPosition(container);
      if (position && onScrollProgressRef.current) {
        onScrollProgressRef.current(position);
      }
    };

    const scrollParent = findScrollableParent(container);
    const isWindowScroll = scrollParent === document.documentElement;
    const target: HTMLElement | Window = isWindowScroll ? window : scrollParent;

    target.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      target.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Report position on visibility change and unmount
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const reportPosition = () => {
      const position = getReadingPosition(container);
      if (position && position.offset > 0 && onScrollProgressRef.current) {
        onScrollProgressRef.current(position);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        reportPosition();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      reportPosition();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div style={{ maxWidth: "100vw", overflowX: "hidden" }}>
      <BookmarkHTMLHighlighter
        ref={contentRef}
        htmlContent={htmlContent}
        highlights={highlights}
        readOnly={readOnly}
        onHighlight={onHighlight}
        onUpdateHighlight={onUpdateHighlight}
        onDeleteHighlight={onDeleteHighlight}
        style={contentStyle}
      />
    </div>
  );
}
