import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";

import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { useTRPC } from "@karakeep/shared-react/trpc";

import BookmarkPdfHighlighterDom from "./BookmarkPdfHighlighterDom";

export default function PDFHighlightViewer({
  bookmarkId,
  assetId,
  ownerId,
}: {
  bookmarkId: string;
  assetId: string;
  ownerId: string;
}) {
  const source = useAssetUrl(assetId);
  const headersKey = JSON.stringify(source.headers);
  const sourceKey = source.uri + headersKey;
  const [downloaded, setDownloaded] = useState<{
    key: string;
    base64: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const api = useTRPC();
  const { data: viewer } = useWhoAmI();
  const { data: highlights, error: highlightError } = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId }),
  );
  const create = useCreateHighlight();
  const update = useUpdateHighlight();
  const remove = useDeleteHighlight();

  useEffect(() => {
    let cancelled = false;
    setDownloaded(null);
    setError(null);
    // Fetch through native networking. API credentials never cross into the
    // document-rendering DOM, and the DOM never fetches an arbitrary PDF URL.
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/pdf-highlight-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    const cleanup = () =>
      ReactNativeBlobUtil.fs.unlink(path).catch(() => undefined);
    const request = ReactNativeBlobUtil.config({ path }).fetch(
      "GET",
      source.uri,
      JSON.parse(headersKey),
    );
    void request
      .then(async (response) => {
        try {
          if (response.info().status !== 200) throw new Error("download");
          const data = await ReactNativeBlobUtil.fs.readFile(path, "base64");
          if (!cancelled) setDownloaded({ key: sourceKey, base64: data });
        } finally {
          await cleanup();
        }
      })
      .catch(async () => {
        await cleanup();
        if (!cancelled)
          setError("Could not load PDF. Please check access and try again.");
      });
    return () => {
      cancelled = true;
      request.cancel(() => {
        void cleanup();
      });
      void cleanup();
    };
  }, [source.uri, headersKey, sourceKey]);

  if (error || highlightError)
    return <Text>{error ?? "Could not load highlights."}</Text>;
  if (!downloaded || downloaded.key !== sourceKey || !highlights)
    return <ActivityIndicator />;
  return (
    <View style={{ flex: 1 }}>
      <BookmarkPdfHighlighterDom
        base64={downloaded.base64}
        assetId={assetId}
        highlights={highlights.highlights}
        readOnly={viewer?.id !== ownerId}
        dom={{ scrollEnabled: false, style: { flex: 1 } }}
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
    </View>
  );
}
