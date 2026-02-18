"use dom";

import "@/globals.css";

import type { Highlight } from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";
import BookmarkHTMLHighlighter from "@karakeep/shared-react/components/BookmarkHtmlHighlighter";

export default function BookmarkHtmlHighlighterDom({
  htmlContent,
  contentStyle,
  highlights,
  readOnly,
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  htmlContent: string;
  contentStyle?: React.CSSProperties;
  highlights?: Highlight[];
  readOnly?: boolean;
  onHighlight?: (highlight: Highlight) => void;
  onUpdateHighlight?: (highlight: Highlight) => void;
  onDeleteHighlight?: (highlight: Highlight) => void;
  dom?: import("expo/dom").DOMProps;
}) {
  return (
    <div style={{ maxWidth: "100vw", overflowX: "hidden" }}>
      <BookmarkHTMLHighlighter
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
