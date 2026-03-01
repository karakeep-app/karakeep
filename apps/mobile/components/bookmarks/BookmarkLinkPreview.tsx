import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import ImageView from "react-native-image-viewing";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { WebViewSourceUri } from "react-native-webview/lib/WebViewTypes";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { isIOS26 } from "@/lib/ios";
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
  shouldUseGlassPill,
  isDark,
  bannerPercent,
  onContinue,
  onDismiss,
}: {
  shouldUseGlassPill: boolean;
  isDark: boolean;
  bannerPercent: number | null;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const pillContent = (
    <>
      <Pressable
        onPress={onContinue}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <BookOpen size={14} className="text-muted-foreground" />
        <Text className="text-sm text-muted-foreground">
          {bannerPercent && bannerPercent > 0
            ? `Continue reading (${bannerPercent}%)`
            : "Continue reading"}
        </Text>
      </Pressable>
      <Pressable onPress={onDismiss} hitSlop={8} style={{ padding: 4 }}>
        <X size={14} className="text-muted-foreground" />
      </Pressable>
    </>
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
    <View
      style={{
        ...pillStyle,
        backgroundColor: isDark ? "#1c1c1e" : "#f2f2f7",
      }}
    >
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
  const shouldUseGlassPill = isIOS26 && isGlassEffectAPIAvailable();

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

  // Gap between the header and the pill.
  const bannerGap = 8;
  const bannerTopHidden = isIOS26 ? insets.top + bannerGap : 0;
  const bannerTop = useSharedValue(headerOffset + bannerGap);
  useEffect(() => {
    bannerTop.value = withTiming(
      barsVisible ? headerOffset + bannerGap : bannerTopHidden,
      {
        duration: 250,
      },
    );
  }, [barsVisible, bannerTop, headerOffset, bannerGap, bannerTopHidden]);

  // Keep the pill mounted during fade-out so it doesn't vanish abruptly.
  const [bannerMounted, setBannerMounted] = useState(showBanner);
  const bannerOpacity = useSharedValue(showBanner ? 1 : 0);
  useEffect(() => {
    if (showBanner) {
      setBannerMounted(true);
      bannerOpacity.value = withTiming(1, { duration: 200 });
    } else {
      bannerOpacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setBannerMounted)(false);
      });
    }
  }, [showBanner]);

  const bannerAnimatedStyle = useAnimatedStyle(() => ({
    top: bannerTop.value,
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
        showProgressBar={isIOS26 ? barsVisible : true}
        progressBarTop={headerOffset + (isIOS26 ? bannerGap : 0)}
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
      {bannerMounted && (
        <Animated.View
          pointerEvents={showBanner ? "auto" : "none"}
          style={[
            {
              position: "absolute",
              left: 0,
              right: 0,
              zIndex: 10,
              alignItems: "center",
            },
            bannerAnimatedStyle,
          ]}
        >
          <ContinueReadingPill
            shouldUseGlassPill={shouldUseGlassPill}
            isDark={isDark}
            bannerPercent={bannerPercent}
            onContinue={onContinue}
            onDismiss={onDismiss}
          />
        </Animated.View>
      )}
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
