"use client";

import PdfHighlighter from "@karakeep/shared-react/components/PdfHighlighter";
import type { PdfHighlightInput } from "@karakeep/shared-react/components/PdfHighlighter";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { useQuery } from "@tanstack/react-query";

export default function PdfBookmarkSection({
  bookmark,
  assetId,
  readOnly,
}: {
  bookmark: ZBookmark;
  assetId: string;
  readOnly: boolean;
}) {
  const api = useTRPC();
  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId: bookmark.id }),
  );
  const { mutate: createHighlight } = useCreateHighlight();
  const { mutate: updateHighlight } = useUpdateHighlight();
  const { mutate: deleteHighlight } = useDeleteHighlight();

  const onHighlight = (highlight: PdfHighlightInput) => {
    createHighlight({
      bookmarkId: bookmark.id,
      ...highlight,
    });
  };

  return (
    <div className="min-h-0 w-full flex-1">
      <PdfHighlighter
        source={`/api/assets/${assetId}`}
        highlights={highlights?.highlights ?? []}
        readOnly={readOnly}
        onHighlight={onHighlight}
        onUpdateHighlight={(highlight) =>
          updateHighlight({
            highlightId: highlight.id,
            color: highlight.color,
            note: highlight.note,
          })
        }
        onDeleteHighlight={(highlight) =>
          deleteHighlight({ highlightId: highlight.id })
        }
      />
    </div>
  );
}
