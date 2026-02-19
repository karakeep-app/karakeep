import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import ImageView from "react-native-image-viewing";
import WebView from "react-native-webview";
import { WebViewSourceUri } from "react-native-webview/lib/WebViewTypes";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { useReaderSettings, WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { useColorScheme } from "@/lib/useColorScheme";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import FullPageError from "../FullPageError";
import FullPageSpinner from "../ui/FullPageSpinner";
import BookmarkAssetImage from "./BookmarkAssetImage";
import BookmarkHtmlHighlighterDom from "./BookmarkHtmlHighlighterDom";
import { PDFViewer } from "./PDFViewer";

export function BookmarkLinkBrowserPreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  return (
    <WebView
      startInLoadingState={true}
      mediaPlaybackRequiresUserAction={true}
      source={{ uri: bookmark.content.url }}
    />
  );
}

export function BookmarkLinkPdfPreview({ bookmark }: { bookmark: ZBookmark }) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  const asset = bookmark.assets.find((r) => r.assetType == "pdf");

  const assetSource = useAssetUrl(asset?.id ?? "");

  if (!asset) {
    return (
      <View className="flex-1 bg-background">
        <Text>Asset has no PDF</Text>
      </View>
    );
  }

  return (
    <View className="flex flex-1">
      <PDFViewer source={assetSource.uri ?? ""} headers={assetSource.headers} />
    </View>
  );
}

export function BookmarkLinkReaderPreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { isDarkColorScheme: isDark } = useColorScheme();
  const { settings: readerSettings } = useReaderSettings();
  const api = useTRPC();
  const queryClient = useQueryClient();

  const {
    data: bookmarkWithContent,
    error,
    isLoading,
    refetch,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId: bookmark.id,
      includeContent: true,
    }),
  );

  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId: bookmark.id,
    }),
  );

  const { mutate: createHighlight } = useCreateHighlight();
  const { mutate: updateHighlight } = useUpdateHighlight();
  const { mutate: deleteHighlight } = useDeleteHighlight();

  // Reading progress
  const lastPositionRef = useRef<{
    offset: number;
    anchor: string;
    percent: number;
  } | null>(null);
  const lastSavedOffsetRef = useRef<number | null>(
    bookmarkWithContent?.content.type === BookmarkTypes.LINK
      ? (bookmarkWithContent.content.readingProgressOffset ?? null)
      : null,
  );

  const { mutate: updateReadingProgress } = useMutation(
    api.bookmarks.updateReadingProgress.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries(api.bookmarks.getBookmark.pathFilter());
      },
    }),
  );

  const saveProgress = useCallback(() => {
    const position = lastPositionRef.current;
    if (!position || position.offset <= 0) return;
    if (lastSavedOffsetRef.current === position.offset) return;

    lastSavedOffsetRef.current = position.offset;
    updateReadingProgress({
      bookmarkId: bookmark.id,
      readingProgressOffset: position.offset,
      readingProgressAnchor: position.anchor,
      readingProgressPercent: position.percent,
    });
  }, [bookmark.id, updateReadingProgress]);

  const handleScrollProgress = useCallback(
    (position: { offset: number; anchor: string; percent: number }) => {
      lastPositionRef.current = position;
    },
    [],
  );

  // Save on AppState change (background/inactive) and unmount
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        saveProgress();
      }
    });

    return () => {
      subscription.remove();
      saveProgress();
    };
  }, [saveProgress]);

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (error) {
    return <FullPageError error={error.message} onRetry={refetch} />;
  }

  if (bookmarkWithContent?.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  const contentStyle: React.CSSProperties = {
    fontFamily: WEBVIEW_FONT_FAMILIES[readerSettings.fontFamily],
    fontSize: `${readerSettings.fontSize}px`,
    lineHeight: String(readerSettings.lineHeight),
    color: isDark ? "#e5e7eb" : "#374151",
    padding: "16px",
    background: isDark ? "#000000" : "#ffffff",
  };

  return (
    <View className="flex-1 bg-background">
      <BookmarkHtmlHighlighterDom
        htmlContent={bookmarkWithContent.content.htmlContent ?? ""}
        contentStyle={contentStyle}
        highlights={highlights?.highlights ?? []}
        initialReadingProgressOffset={
          bookmarkWithContent.content.readingProgressOffset
        }
        initialReadingProgressAnchor={
          bookmarkWithContent.content.readingProgressAnchor
        }
        onScrollProgress={handleScrollProgress}
        onHighlight={(h) =>
          createHighlight({
            startOffset: h.startOffset,
            endOffset: h.endOffset,
            color: h.color,
            bookmarkId: bookmark.id,
            text: h.text,
            note: h.note ?? null,
          })
        }
        onUpdateHighlight={(h) =>
          updateHighlight({
            highlightId: h.id,
            color: h.color,
            note: h.note,
          })
        }
        onDeleteHighlight={(h) =>
          deleteHighlight({
            highlightId: h.id,
          })
        }
        dom={{ scrollEnabled: true }}
      />
    </View>
  );
}

export function BookmarkLinkArchivePreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const asset =
    bookmark.assets.find((r) => r.assetType == "precrawledArchive") ??
    bookmark.assets.find((r) => r.assetType == "fullPageArchive");

  const assetSource = useAssetUrl(asset?.id ?? "");

  if (!asset) {
    return (
      <View className="flex-1 bg-background">
        <Text>Asset has no offline archive</Text>
      </View>
    );
  }

  const webViewUri: WebViewSourceUri = {
    uri: assetSource.uri!,
    headers: assetSource.headers,
  };
  return (
    <WebView
      startInLoadingState={true}
      mediaPlaybackRequiresUserAction={true}
      source={webViewUri}
      decelerationRate={0.998}
    />
  );
}

export function BookmarkLinkScreenshotPreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const asset = bookmark.assets.find((r) => r.assetType == "screenshot");

  const assetSource = useAssetUrl(asset?.id ?? "");
  const [imageZoom, setImageZoom] = useState(false);

  if (!asset) {
    return (
      <View className="flex-1 bg-background">
        <Text>Asset has no screenshot</Text>
      </View>
    );
  }

  return (
    <View className="flex flex-1 gap-2">
      <ImageView
        visible={imageZoom}
        imageIndex={0}
        onRequestClose={() => setImageZoom(false)}
        doubleTapToZoomEnabled={true}
        images={[assetSource]}
      />
      <Pressable onPress={() => setImageZoom(true)}>
        <BookmarkAssetImage
          assetId={asset.id}
          className="h-full w-full"
          contentFit="contain"
        />
      </Pressable>
    </View>
  );
}
