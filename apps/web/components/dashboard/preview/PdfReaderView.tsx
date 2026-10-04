"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import dynamic from "next/dynamic";

import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { getAssetUrl } from "@karakeep/shared/utils/assetUtils";

const BookmarkPdfHighlighter = dynamic(
  () => import("@karakeep/shared-react/components/BookmarkPdfHighlighter"),
  { ssr: false },
);

export default function PdfReaderView({
  bookmarkId,
  assetId,
  ownerId,
}: {
  bookmarkId: string;
  assetId: string;
  ownerId: string;
}) {
  const api = useTRPC();
  const { data: session } = useSession();
  const { data, error } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId }),
  );
  const create = useCreateHighlight();
  const update = useUpdateHighlight();
  const remove = useDeleteHighlight();
  if (error) return <p role="alert">Could not load PDF highlights.</p>;
  return (
    <BookmarkPdfHighlighter
      source={{ url: getAssetUrl(assetId) }}
      assetId={assetId}
      highlights={data?.highlights}
      readOnly={session?.user.id !== ownerId || !data}
      onCreate={async (highlight) => {
        await create.mutateAsync({
          ...highlight,
          bookmarkId,
          startOffset: 0,
          endOffset: 0,
        });
      }}
      onUpdate={async (highlightId, color, note) => {
        await update.mutateAsync({ highlightId, color, note });
      }}
      onDelete={async (highlightId) => {
        await remove.mutateAsync({ highlightId });
      }}
    />
  );
}
