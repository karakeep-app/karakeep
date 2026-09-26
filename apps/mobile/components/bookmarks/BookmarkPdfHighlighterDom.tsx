"use dom";

import BookmarkPdfHighlighter from "@karakeep/shared-react/components/BookmarkPdfHighlighter";
import type {
  NewPDFHighlight,
  PDFHighlight,
} from "@karakeep/shared-react/components/BookmarkPdfHighlighter";
import type { ZHighlightColor } from "@karakeep/shared/types/highlights";

export default function BookmarkPdfHighlighterDom({
  base64,
  assetId,
  highlights,
  readOnly,
  onCreate,
  onUpdate,
  onDelete,
}: {
  base64: string;
  assetId: string;
  highlights: PDFHighlight[];
  readOnly: boolean;
  onCreate: (highlight: NewPDFHighlight) => Promise<void>;
  onUpdate: (
    id: string,
    color: ZHighlightColor,
    note: string | null,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}) {
  return (
    <div style={{ height: "100vh", margin: 0 }}>
      <BookmarkPdfHighlighter
        source={{ base64 }}
        assetId={assetId}
        highlights={highlights}
        readOnly={readOnly}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}
