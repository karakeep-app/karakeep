"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryState } from "nuqs";
import { GlobalWorkerOptions } from "pdfjs-dist";
import SharedPdfViewer from "@karakeep/shared-react/components/PdfViewer";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function PdfViewer({
  bookmarkId,
  assetId,
  readOnly,
}: {
  bookmarkId: string;
  assetId: string;
  readOnly: boolean;
}) {
  const api = useTRPC();
  const { data } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId }),
  );
  const create = useCreateHighlight();
  const update = useUpdateHighlight();
  const remove = useDeleteHighlight();
  const [requestedHighlight, setRequestedHighlight] =
    useQueryState("pdfHighlight");
  const navigated = useCallback(() => {
    void setRequestedHighlight(null);
  }, [setRequestedHighlight]);
  const source = getAssetUrl(assetId);
  return (
    <SharedPdfViewer
      assetId={assetId}
      source={source}
      originalUrl={source}
      readOnly={readOnly}
      highlights={data?.highlights ?? []}
      requestedHighlight={requestedHighlight}
      onNavigateHighlight={navigated}
      onCreate={(h) =>
        create.mutateAsync({
          bookmarkId,
          startOffset: 0,
          endOffset: 0,
          text: h.text,
          color: h.color,
          note: h.note ?? null,
          pdfAnchor: h.pdfAnchor,
        })
      }
      onUpdate={(h) =>
        update.mutateAsync({ highlightId: h.id, color: h.color, note: h.note })
      }
      onDelete={(h) => remove.mutateAsync({ highlightId: h.id })}
    />
  );
}
