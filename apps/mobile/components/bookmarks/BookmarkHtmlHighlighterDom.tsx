"use dom";

import "@/globals.css";

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
  readingProgressOffset,
  readingProgressAnchor,
  restoreReadingPosition,
  onSavePosition,
  onScrollPositionChange,
  showProgressBar = true,
  progressBarTop = 0,
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
  showProgressBar?: boolean;
  progressBarTop?: number;
  dom?: import("expo/dom").DOMProps;
}) {
  const bgColor = contentStyle?.background ?? contentStyle?.backgroundColor;

  return (
    <div
      style={{
        maxWidth: "100vw",
        overflowX: "clip",
        minHeight: "100vh",
        background: bgColor,
      }}
    >
      <ScrollProgressTracker
        onSavePosition={onSavePosition}
        onScrollPositionChange={onScrollPositionChange}
        restorePosition={restoreReadingPosition}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        showProgressBar={showProgressBar}
        progressBarStyle={{ position: "fixed", top: progressBarTop }}
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
