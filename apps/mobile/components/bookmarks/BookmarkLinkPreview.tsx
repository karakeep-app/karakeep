import { useEffect, useState } from "react";
import { Platform, Pressable, TouchableOpacity, View } from "react-native";
import ImageView from "react-native-image-viewing";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { WebViewSourceUri } from "react-native-webview/lib/WebViewTypes";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { useReaderSettings, WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { useColorScheme } from "@/lib/useColorScheme";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, X } from "lucide-react-native";

import {
  useCreateHighlight,
  useDeleteHighlight,
  useUpdateHighlight,
} from "@karakeep/shared-react/hooks/highlights";
import { useReadingProgress } from "@karakeep/shared-react/hooks/reading-progress";
import { useTRPC } from "@karakeep/shared-react/trpc";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import FullPageError from "../FullPageError";
import FullPageSpinner from "../ui/FullPageSpinner";
import BookmarkAssetImage from "./BookmarkAssetImage";
import BookmarkHtmlHighlighterDom from "./BookmarkHtmlHighlighterDom";
import { PDFViewer } from "./PDFViewer";

// Standard iOS navigation bar height (points)
const NAV_BAR_HEIGHT = 44;

export function BookmarkLinkBrowserPreview({
  bookmark,
  onScrollOffsetChange,
  contentInsetTop = 0,
  contentInsetBottom = 0,
}: {
  bookmark: ZBookmark;
  onScrollOffsetChange?: (y: number) => void;
  contentInsetTop?: number;
  contentInsetBottom?: number;
}) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  return (
    <WebView
      startInLoadingState={true}
      mediaPlaybackRequiresUserAction={true}
      source={{ uri: bookmark.content.url }}
      onScroll={(e) => onScrollOffsetChange?.(e.nativeEvent.contentOffset.y)}
      automaticallyAdjustContentInsets={false}
      contentInset={{ top: contentInsetTop, bottom: contentInsetBottom }}
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
  onScrollOffsetChange,
  barsVisible = true,
  contentInsetBottom = 0,
}: {
  bookmark: ZBookmark;
  onScrollOffsetChange?: (y: number) => void;
  barsVisible?: boolean;
  contentInsetBottom?: number;
}) {
  const isIOS26 =
    Platform.OS === "ios" && parseInt(Platform.Version as string, 10) >= 26;

  const { isDarkColorScheme: isDark } = useColorScheme();
  const { settings: readerSettings } = useReaderSettings();
  const insets = useSafeAreaInsets();
  const api = useTRPC();

  // On iOS 26 the header is transparent, so content extends behind it and we
  // need to offset by the safe-area top + nav-bar height. On Android / older
  // iOS the header is opaque — content already starts below it.
  const headerOffset = isIOS26 ? insets.top + NAV_BAR_HEIGHT : 0;

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

  const {
    showBanner,
    bannerPercent,
    onContinue,
    onDismiss,
    restorePosition,
    readingProgressOffset,
    readingProgressAnchor,
    onSavePosition,
    onScrollPositionChange,
  } = useReadingProgress({
    bookmarkId: bookmark.id,
  });

  // Small gap between the transparent header and the banner on iOS 26;
  // on other platforms the opaque header already provides separation.
  const bannerGap = isIOS26 ? 8 : 0;
  const bannerTop = useSharedValue(headerOffset + bannerGap);
  useEffect(() => {
    bannerTop.value = withTiming(
      barsVisible ? headerOffset + bannerGap : -bannerGap,
      {
        duration: 250,
      },
    );
  }, [barsVisible, bannerTop, headerOffset, bannerGap]);
  const bannerAnimatedStyle = useAnimatedStyle(() => ({
    top: bannerTop.value,
  }));

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (error) {
    return <FullPageError error={error.message} onRetry={refetch} />;
  }

  if (bookmarkWithContent?.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  const BANNER_HEIGHT = 40;

  const contentStyle: React.CSSProperties = {
    fontFamily: WEBVIEW_FONT_FAMILIES[readerSettings.fontFamily],
    fontSize: `${readerSettings.fontSize}px`,
    lineHeight: String(readerSettings.lineHeight),
    color: isDark ? "#e5e7eb" : "#374151",
    paddingTop: `${headerOffset + (showBanner ? BANNER_HEIGHT : 0)}px`,
    paddingBottom: `${contentInsetBottom}px`,
    paddingLeft: "16px",
    paddingRight: "16px",
    background: isDark ? "#000000" : "#ffffff",
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? "#000000" : "#ffffff" }}>
      {showBanner && (
        <Animated.View
          className="flex-row items-center gap-2 border-b border-border bg-background px-4 py-2"
          style={[
            { position: "absolute", left: 0, right: 0, zIndex: 10 },
            bannerAnimatedStyle,
          ]}
        >
          <BookOpen size={16} className="text-muted-foreground" />
          <Text className="flex-1 text-sm text-muted-foreground">
            {bannerPercent && bannerPercent > 0
              ? `Continue where you left off (${bannerPercent}%)`
              : "Continue where you left off"}
          </Text>
          <TouchableOpacity
            onPress={onContinue}
            className="rounded-md bg-primary px-3 py-1"
          >
            <Text className="text-xs font-medium text-primary-foreground">
              Continue
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} className="p-1">
            <X size={14} className="text-muted-foreground" />
          </TouchableOpacity>
        </Animated.View>
      )}
      <BookmarkHtmlHighlighterDom
        htmlContent={bookmarkWithContent.content.htmlContent ?? ""}
        contentStyle={contentStyle}
        highlights={highlights?.highlights ?? []}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        restoreReadingPosition={restorePosition}
        onSavePosition={onSavePosition}
        showProgressBar={isIOS26 ? barsVisible : true}
        progressBarTop={headerOffset + bannerGap}
        onScrollPositionChange={(position) => {
          onScrollPositionChange?.(position);
          // Use percent (0-100) scaled to a synthetic pixel range for scroll
          // direction detection. position.offset is a text character count and
          // would cause useScrollDirection to immediately hide the bars.
          onScrollOffsetChange?.(position.percent * 10);
        }}
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
        dom={{ scrollEnabled: true, contentInsetAdjustmentBehavior: "never" }}
      />
    </View>
  );
}

export function BookmarkLinkArchivePreview({
  bookmark,
  onScrollOffsetChange,
  contentInsetTop = 0,
  contentInsetBottom = 0,
}: {
  bookmark: ZBookmark;
  onScrollOffsetChange?: (y: number) => void;
  contentInsetTop?: number;
  contentInsetBottom?: number;
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
      onScroll={(e) => onScrollOffsetChange?.(e.nativeEvent.contentOffset.y)}
      automaticallyAdjustContentInsets={false}
      contentInset={{ top: contentInsetTop, bottom: contentInsetBottom }}
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
