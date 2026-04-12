"use dom";

import "@/globals.css";

import { useEffect } from "react";

import type { Highlight } from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";

export default function BookmarkHtmlHighlighterDom({
  htmlContent,
  contentStyle,
  highlights,
  readOnly,
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
  onLinkPress,
  onImagePress,
  readingProgressOffset,
  readingProgressAnchor,
  restoreReadingPosition,
  onSavePosition,
  onScrollPositionChange,
}: {
  htmlContent: string;
  contentStyle?: React.CSSProperties;
  highlights?: Highlight[];
  readOnly?: boolean;
  onHighlight?: (highlight: Highlight) => void;
  onUpdateHighlight?: (highlight: Highlight) => void;
  onDeleteHighlight?: (highlight: Highlight) => void;
  onLinkPress?: (url: string) => void;
  onImagePress?: (src: string) => void;
  readingProgressOffset?: number | null;
  readingProgressAnchor?: string | null;
  restoreReadingPosition?: boolean;
  onSavePosition?: (position: {
    offset: number;
    anchor: string;
    percent: number;
  }) => void;
  onScrollPositionChange?: (position: {
    offset: number;
    anchor: string;
    percent: number;
  }) => void;
  dom?: import("expo/dom").DOMProps;
}) {
  // Intercept link and image clicks to open them externally
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't intercept if the user is selecting text (for highlighting)
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        return;
      }

      // Check for link clicks
      const anchor = target.closest("a");
      if (anchor?.href) {
        const href = anchor.href;
        // Allow in-page anchor links
        if (
          href.startsWith("#") ||
          anchor.getAttribute("href")?.startsWith("#")
        ) {
          return;
        }
        // Ignore javascript: URLs
        if (href.startsWith("javascript:")) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        onLinkPress?.(href);
        return;
      }

      // Check for image clicks
      const img = target.closest("img");
      if (img?.src) {
        e.preventDefault();
        onImagePress?.(img.src);
        return;
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [onLinkPress, onImagePress]);
  return (
    <div style={{ maxWidth: "100vw", overflowX: "hidden" }}>
      <ScrollProgressTracker
        onSavePosition={onSavePosition}
        onScrollPositionChange={onScrollPositionChange}
        restorePosition={restoreReadingPosition}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        showProgressBar
        progressBarStyle={{ position: "fixed" }}
      >
        <BookmarkHTMLHighlighter
          htmlContent={htmlContent}
          highlights={highlights}
          readOnly={readOnly}
          onHighlight={onHighlight}
          onUpdateHighlight={onUpdateHighlight}
          onDeleteHighlight={onDeleteHighlight}
          style={contentStyle}
        />
      </ScrollProgressTracker>
    </div>
  );
}
