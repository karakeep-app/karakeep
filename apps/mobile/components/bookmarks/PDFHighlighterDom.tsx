"use dom";

import PdfHighlighter from "@karakeep/shared-react/components/PdfHighlighter";
import type { PdfHighlightInput } from "@karakeep/shared-react/components/PdfHighlighter";
import type { ZHighlight } from "@karakeep/shared/types/highlights";

export default function PDFHighlighterDom({
  source,
  headers,
  highlights,
  readOnly,
  onHighlight,
  onUpdateHighlight,
  onDeleteHighlight,
}: {
  source: string;
  headers?: Record<string, string>;
  highlights?: ZHighlight[];
  readOnly?: boolean;
  onHighlight?: (highlight: PdfHighlightInput) => void;
  onUpdateHighlight?: (highlight: ZHighlight) => void;
  onDeleteHighlight?: (highlight: ZHighlight) => void;
  dom?: import("expo/dom").DOMProps;
}) {
  return (
    <PdfHighlighter
      source={source}
      headers={headers}
      highlights={highlights}
      readOnly={readOnly}
      onHighlight={onHighlight}
      onUpdateHighlight={onUpdateHighlight}
      onDeleteHighlight={onDeleteHighlight}
    />
  );
}
