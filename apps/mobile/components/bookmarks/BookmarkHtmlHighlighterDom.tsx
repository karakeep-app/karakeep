"use dom";

import "@/globals.css";

import { useEffect, useRef } from "react";

import type {
  Highlight,
  HighlightDockLabels,
} from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import ScrollProgressTracker from "@karakeep/shared-react/components/ScrollProgressTracker";

export default function BookmarkHtmlHighlighterDom({
  htmlContent,
  contentStyle,
  isDark,
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
  focusHighlightId,
  dockFormAt,
  dockLabels,
  articleTitle,
  articleSource,
  progressColor,
  fadeBottom,
  onPageTap,
}: {
  htmlContent: string;
  contentStyle?: React.CSSProperties;
  isDark: boolean;
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
  /** Scroll this highlight into view and draw attention to it. */
  focusHighlightId?: string;
  dockFormAt?: number;
  dockLabels?: HighlightDockLabels;
  articleTitle?: string;
  articleSource?: string;
  progressColor?: string;
  /** Text fades out under a toolbar floating over the content. */
  fadeBottom?: boolean;
  onPageTap?: () => void;
  dom?: import("expo/dom").DOMProps;
}) {
  // Highlights are re-applied on every render, so wait for the one we want and
  // only act once: re-scrolling later would fight with the reader's own scroll.
  const hasFocusedHighlight = useRef(false);
  useEffect(() => {
    if (!focusHighlightId || hasFocusedHighlight.current) {
      return;
    }
    const element = document.querySelector<HTMLElement>(
      `[data-highlight-id="${CSS.escape(focusHighlightId)}"]`,
    );
    if (!element) {
      return;
    }
    hasFocusedHighlight.current = true;
    element.scrollIntoView({ block: "center" });
    document
      .querySelectorAll<HTMLElement>(
        `[data-highlight-id="${CSS.escape(focusHighlightId)}"]`,
      )
      .forEach((part) =>
        part.animate([{ opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }], {
          duration: 700,
          iterations: 2,
          easing: "ease-in-out",
        }),
      );
  }, [focusHighlightId, highlights]);

  // Strip href from links so the browser treats them as regular selectable text
  // instead of activating native link gestures (iOS preview, Android drag).
  // The URL is preserved in data-href for our click handler.
  useEffect(() => {
    const stripHrefs = () => {
      document.querySelectorAll("a[href]").forEach((a) => {
        const anchor = a as HTMLAnchorElement;
        if (!anchor.dataset.href) {
          anchor.dataset.href = anchor.getAttribute("href")!;
          anchor.removeAttribute("href");
        }
      });
    };

    stripHrefs();

    // Re-strip if the DOM changes (e.g. highlight effects re-render content)
    const observer = new MutationObserver(stripHrefs);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  // Intercept link and image clicks to open them externally
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      onPageTap?.();
      const target = e.target as HTMLElement;

      // Don't intercept if the user is selecting text (for highlighting)
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) {
        return;
      }

      // Check for link clicks (href is stored in data-href)
      const anchor = target.closest("a");
      const href = anchor?.dataset.href;
      if (href) {
        // Allow in-page anchor links
        if (href.startsWith("#")) {
          const targetEl = document.querySelector(href);
          if (targetEl) {
            targetEl.scrollIntoView();
          }
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

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [onLinkPress, onImagePress, onPageTap]);
  return (
    <div
      className={isDark ? "dark" : undefined}
      style={{
        width: "100%",
        maxWidth: "100vw",
        overflowX: "hidden",
        // The content is capped to a readable width on tablets, so paint its
        // background edge to edge.
        background: contentStyle?.background,
      }}
    >
      {/* The shared highlight colours are pastels made for white pages. */}
      <style>{`
        ${progressColor ? `[data-reading-progress] > div { background-color: ${progressColor} !important; }` : ""}
        html, body { background: ${contentStyle?.background ?? "transparent"}; }
        .dark [data-highlight].bg-yellow-200 { background: rgba(250, 204, 21, 0.32); }
        .dark [data-highlight].bg-red-200 { background: rgba(248, 113, 113, 0.32); }
        .dark [data-highlight].bg-green-200 { background: rgba(74, 222, 128, 0.28); }
        .dark [data-highlight].bg-blue-200 { background: rgba(96, 165, 250, 0.34); }
      `}</style>
      {contentStyle?.background ? (
        <>
          <div
            aria-hidden
            style={{
              position: "fixed",
              zIndex: 10,
              top: 0,
              left: 0,
              right: 0,
              height: 16,
              pointerEvents: "none",
              background: `linear-gradient(to bottom, ${contentStyle.background}, transparent)`,
            }}
          />
          {fadeBottom ? (
            <div
              aria-hidden
              style={{
                position: "fixed",
                zIndex: 10,
                bottom: 0,
                left: 0,
                right: 0,
                height: 128,
                pointerEvents: "none",
                background: `linear-gradient(to top, ${contentStyle.background} 45%, transparent)`,
              }}
            />
          ) : null}
        </>
      ) : null}
      {articleTitle ? (
        <div
          style={{
            maxWidth: contentStyle?.maxWidth,
            margin: "0 auto",
            padding: "16px 16px 0",
          }}
        >
          <h1
            style={{
              fontFamily: contentStyle?.fontFamily,
              fontSize: 28,
              lineHeight: 1.2,
              fontWeight: 700,
              margin: 0,
              color: isDark ? "#fff" : "#111",
            }}
          >
            {articleTitle}
          </h1>
          {articleSource ? (
            <p
              style={{
                fontFamily: "-apple-system, system-ui, sans-serif",
                fontSize: 14,
                margin: "8px 0 0",
                color: isDark ? "#98989f" : "#636366",
              }}
            >
              {articleSource}
            </p>
          ) : null}
        </div>
      ) : null}
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
          className="[&>*:first-child]:!mt-0 dark:[&_*]:!text-inherit dark:[&_a]:!text-[var(--tw-prose-links)] [&_img]:!mx-auto [&_img]:!block"
          htmlContent={htmlContent}
          highlights={highlights}
          readOnly={readOnly}
          onHighlight={onHighlight}
          onUpdateHighlight={onUpdateHighlight}
          onDeleteHighlight={onDeleteHighlight}
          dockFormAt={dockFormAt}
          dockLabels={dockLabels}
          style={contentStyle}
        />
      </ScrollProgressTracker>
    </div>
  );
}
