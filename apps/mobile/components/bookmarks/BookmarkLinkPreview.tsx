import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import ImageView from "react-native-image-viewing";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewProps } from "react-native-webview";
import { WebViewSource } from "react-native-webview/lib/WebViewTypes";
import { BlurView } from "expo-blur";
import { GlassView } from "expo-glass-effect";
import { TailwindResolver } from "@/components/TailwindResolver";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { shouldUseGlassPill } from "@/lib/ios";
import { useStableHeaderHeight } from "@/lib/useStableHeaderHeight";
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

interface ScrollableWebViewProps {
  source: WebViewSource;
  onScrollOffsetChange?: (y: number) => void;
  contentInsetTop: number;
  contentInsetBottom: number;
  webViewProps?: Omit<
    WebViewProps,
    "source" | "onScroll" | "automaticallyAdjustContentInsets" | "contentInset"
  >;
}

// WebView's contentInset prop is iOS-only; on Android we wrap in a padded
// View to keep the content from being obscured by the floating toolbar.
function ScrollableWebView({
  source,
  onScrollOffsetChange,
  contentInsetTop,
  contentInsetBottom,
  webViewProps,
}: ScrollableWebViewProps) {
  const androidPadding =
    Platform.OS === "android"
      ? { paddingTop: contentInsetTop, paddingBottom: contentInsetBottom }
      : null;

  return (
    <View style={[{ flex: 1 }, androidPadding]}>
      <WebView
        startInLoadingState={true}
        mediaPlaybackRequiresUserAction={true}
        {...webViewProps}
        source={source}
        onScroll={(e) => onScrollOffsetChange?.(e.nativeEvent.contentOffset.y)}
        automaticallyAdjustContentInsets={false}
        contentInset={{ top: contentInsetTop, bottom: contentInsetBottom }}
      />
    </View>
  );
}

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
    <ScrollableWebView
      source={{ uri: bookmark.content.url }}
      onScrollOffsetChange={onScrollOffsetChange}
      contentInsetTop={contentInsetTop}
      contentInsetBottom={contentInsetBottom}
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

// Small gap between the progress bar and the continue-reading banner; same
// on every platform. The progress bar itself sits flush against the header.
const BANNER_GAP = 8;

const pillStyle = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  borderRadius: 22,
  paddingVertical: 8,
  paddingLeft: 14,
  paddingRight: 8,
  gap: 8,
};

function ContinueReadingPill({
  cardColor,
  bannerPercent,
  onContinue,
  onDismiss,
}: {
  cardColor: string;
  bannerPercent: number | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const pillContent = (
    <TailwindResolver
      className="text-muted-foreground"
      comp={(styles) => {
        const color = styles?.color?.toString();
        return (
          <>
            <Pressable
              onPress={onContinue}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <BookOpen size={14} color={color} />
              <Text style={{ fontSize: 14, color }}>
                {bannerPercent && bannerPercent > 0
                  ? `Continue reading (${bannerPercent}%)`
                  : "Continue reading"}
              </Text>
            </Pressable>
            <Pressable onPress={onDismiss} hitSlop={8} style={{ padding: 4 }}>
              <X size={14} color={color} />
            </Pressable>
          </>
        );
      }}
    />
  );

  if (shouldUseGlassPill) {
    return (
      <GlassView glassEffectStyle="regular" style={pillStyle}>
        {pillContent}
      </GlassView>
    );
  }

  if (Platform.OS === "ios") {
    return (
      <BlurView
        tint="systemMaterial"
        intensity={80}
        style={{ ...pillStyle, overflow: "hidden" }}
      >
        {pillContent}
      </BlurView>
    );
  }

  return (
    <View style={{ ...pillStyle, backgroundColor: cardColor }}>
      {pillContent}
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
  const { isDarkColorScheme: isDark, colors } = useColorScheme();
  const { settings: readerSettings } = useReaderSettings();
  const api = useTRPC();
  const insets = useSafeAreaInsets();

  // Measured by React Navigation; includes the safe-area inset and the
  // platform-correct nav-bar height (44 on iOS, 56 on Android Material).
  // The stable variant keeps this value pinned to the last visible-header
  // measurement when the header hides, so the banner doesn't snap to the
  // top of the viewport mid-animation.
  const headerOffset = useStableHeaderHeight();
  // Just the nav-bar portion, used to tuck the banner under the status bar
  // when the header hides — matches the header's own animation.
  const navBarHeight = headerOffset - insets.top;

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

  // Slide the pill up by the header's visible height when bars hide, so it
  // tucks just under the status bar — matching the header's own animation.
  const bannerTranslateY = useSharedValue(0);
  useEffect(() => {
    bannerTranslateY.value = withTiming(barsVisible ? 0 : -navBarHeight, {
      duration: 250,
    });
  }, [barsVisible, bannerTranslateY, navBarHeight]);

  const bannerOpacity = useSharedValue(showBanner ? 1 : 0);
  useEffect(() => {
    bannerOpacity.value = withTiming(showBanner ? 1 : 0, { duration: 200 });
  }, [showBanner, bannerOpacity]);

  // translateY (UI-thread composited) avoids the layout-recalc jumps that
  // animating `top` would cause.
  const bannerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerTranslateY.value }],
    opacity: bannerOpacity.value,
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

  const contentStyle: React.CSSProperties = {
    fontFamily: WEBVIEW_FONT_FAMILIES[readerSettings.fontFamily],
    fontSize: `${readerSettings.fontSize}px`,
    lineHeight: String(readerSettings.lineHeight),
    color: isDark ? "#e5e7eb" : "#374151",
    paddingTop: `${headerOffset}px`,
    paddingBottom: `${contentInsetBottom}px`,
    paddingLeft: "16px",
    paddingRight: "16px",
    background: isDark ? "#000000" : "#ffffff",
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? "#000000" : "#ffffff" }}>
      <BookmarkHtmlHighlighterDom
        htmlContent={bookmarkWithContent.content.htmlContent ?? ""}
        contentStyle={contentStyle}
        highlights={highlights?.highlights ?? []}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        restoreReadingPosition={restorePosition}
        onSavePosition={onSavePosition}
        showProgressBar={barsVisible}
        progressBarTop={headerOffset}
        onScrollPositionChange={onScrollPositionChange}
        onScrollOffsetChange={onScrollOffsetChange}
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
      <Animated.View
        pointerEvents={showBanner ? "auto" : "none"}
        style={[
          {
            position: "absolute",
            top: headerOffset + BANNER_GAP,
            left: 0,
            right: 0,
            zIndex: 10,
            alignItems: "center",
          },
          bannerAnimatedStyle,
        ]}
      >
        <ContinueReadingPill
          cardColor={colors.card}
          bannerPercent={bannerPercent}
          onContinue={onContinue}
          onDismiss={onDismiss}
        />
      </Animated.View>
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

  return (
    <ScrollableWebView
      source={{ uri: assetSource.uri!, headers: assetSource.headers }}
      onScrollOffsetChange={onScrollOffsetChange}
      contentInsetTop={contentInsetTop}
      contentInsetBottom={contentInsetBottom}
      webViewProps={{ decelerationRate: 0.998 }}
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
