import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import { useLocalSearchParams } from "expo-router";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { useQuery } from "@tanstack/react-query";
import { useColorScheme } from "nativewind";
import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import BookmarkPdfHighlighterDom from "./BookmarkPdfHighlighterDom";
import { PDFViewer } from "./PDFViewer";

import { downloadHighlightPdf } from "./downloadHighlightPdf";

export default function BookmarkPdfView({
  bookmarkId,
  assetId,
  ownerId,
}: {
  bookmarkId: string;
  assetId: string;
  ownerId: string;
}) {
  const api = useTRPC();
  const currentUser = useWhoAmI();
  const { colorScheme } = useColorScheme();
  const source = useAssetUrl(assetId);
  const headersKey = JSON.stringify(source.headers);
  const { pdfHighlight } = useLocalSearchParams<{ pdfHighlight?: string }>();
  const [nativeReader, setNativeReader] = useState(false);
  const [loaded, setLoaded] = useState<{
    source: string;
    headersKey: string;
    base64: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const highlights = useQuery(
    api.highlights.getForBookmark.queryOptions({ bookmarkId }),
  );
  const create = useCreateHighlight();
  const update = useUpdateHighlight();
  const remove = useDeleteHighlight();
  const readOnly = !highlights.data || currentUser.data?.id !== ownerId;

  useEffect(() => {
    if (nativeReader) return;
    let disposed = false;
    setLoaded(null);
    setError(null);
    // Fetch with native authentication, then marshal only the PDF bytes across
    // Expo's DOM bridge. The DOM document never receives the server API token.
    const path = `${ReactNativeBlobUtil.fs.dirs.CacheDir}/karakeep-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    const task = downloadHighlightPdf(
      ReactNativeBlobUtil,
      source.uri,
      JSON.parse(headersKey) as Record<string, string>,
      path,
    );
    void (async () => {
      try {
        const base64 = await task.promise;
        if (!disposed && base64 !== null)
          setLoaded({ source: source.uri, headersKey, base64 });
      } catch (err) {
        if (!disposed)
          setError(err instanceof Error ? err.message : "Unable to load PDF.");
      }
    })();
    return () => {
      disposed = true;
      task.cancel();
    };
  }, [source.uri, headersKey, nativeReader, retry]);

  const base64 =
    loaded?.source === source.uri && loaded.headersKey === headersKey
      ? loaded.base64
      : null;
  return (
    <View className="flex-1 bg-background">
      <View className="flex-row flex-wrap items-center gap-3 border-b border-border p-2">
        <Pressable
          accessibilityRole="button"
          onPress={() => setNativeReader((value) => !value)}
          className="rounded border border-border p-3"
        >
          <Text>
            {nativeReader ? "Show highlights" : "Open original reader"}
          </Text>
        </Pressable>
        {!nativeReader && !readOnly && (
          <Text className="text-sm text-muted-foreground">
            Select text, then tap Highlight selected text.
          </Text>
        )}
      </View>
      {nativeReader ? (
        <PDFViewer source={source.uri} headers={source.headers} />
      ) : error ? (
        <View className="gap-3 p-4">
          <Text accessibilityRole="alert">{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRetry((value) => value + 1)}
          >
            <Text>Retry PDF</Text>
          </Pressable>
        </View>
      ) : !base64 || highlights.isPending || currentUser.isPending ? (
        <ActivityIndicator className="m-4" />
      ) : (
        <BookmarkPdfHighlighterDom
          // Expo captures initial DOM props before the document loads. Mount
          // with settled highlights, and remount after a read-only error retry.
          key={`${assetId}-${readOnly ? "read-only" : "editable"}`}
          pdfBase64={base64}
          assetId={assetId}
          isDark={colorScheme === "dark"}
          highlights={(highlights.data?.highlights ?? []).map((h) => ({
            id: h.id,
            startOffset: h.startOffset,
            endOffset: h.endOffset,
            color: h.color,
            text: h.text,
            note: h.note,
            pdfAnchor: h.pdfAnchor,
          }))}
          readOnly={readOnly}
          requestedHighlight={
            typeof pdfHighlight === "string" ? pdfHighlight : undefined
          }
          onCreate={async (h) => {
            await create.mutateAsync({
              bookmarkId,
              startOffset: 0,
              endOffset: 0,
              text: h.text,
              color: h.color,
              note: h.note ?? null,
              pdfAnchor: h.pdfAnchor,
            });
          }}
          onUpdate={async (h) => {
            await update.mutateAsync({
              highlightId: h.id,
              color: h.color,
              note: h.note,
            });
          }}
          onDelete={async (h) => {
            await remove.mutateAsync({ highlightId: h.id });
          }}
          dom={{ scrollEnabled: false }}
        />
      )}
      {!nativeReader && highlights.isError && (
        <Pressable
          accessibilityRole="button"
          className="p-3"
          onPress={() => {
            void highlights.refetch();
          }}
        >
          <Text accessibilityRole="alert">
            Could not load highlights. Tap to retry.
          </Text>
        </Pressable>
      )}
    </View>
  );
}
