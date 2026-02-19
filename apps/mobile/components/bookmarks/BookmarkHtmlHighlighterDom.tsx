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
  return (
    <div style={{ maxWidth: "100vw", overflowX: "hidden" }}>
      <ScrollProgressTracker
        onScrollProgress={onScrollProgress}
        restorePosition={restoreReadingPosition}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
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
