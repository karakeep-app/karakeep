import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ImageView from "react-native-image-viewing";
import WebView from "react-native-webview";
import {
  ShouldStartLoadRequest,
  WebViewSourceUri,
} from "react-native-webview/lib/WebViewTypes";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import QueryPageState from "@/components/QueryPageState";
import { Text } from "@/components/ui/Text";
import { useToast } from "@/components/ui/Toast";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBookmarkDisplayTitle, getDisplayHost } from "@/lib/bookmarkDisplay";
import { useAssetUrl } from "@/lib/hooks";
import { shouldUseGlassPill } from "@/lib/ios";
import {
  getOfflineLibraryScope,
  useOfflineArticleContent,
} from "@/lib/offlineLibrary";
import { useReaderSettings, WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { READABLE_CONTENT_MAX_WIDTH } from "@/lib/responsive";
import useAppSettings from "@/lib/settings";
import {
  useCommonActions,
  useCommonStrings,
  useTranslation,
} from "@/lib/i18n/hooks";
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
import type { ReadingPosition } from "@karakeep/shared/utils/reading-progress-dom";

import BookmarkHtmlHighlighterDom from "./BookmarkHtmlHighlighterDom";
import { PDFViewer } from "./PDFViewer";

/** Lets the reader hide the floating toolbar while someone is reading. */
export const ReaderChromeContext = createContext<(hidden: boolean) => void>(
  () => undefined,
);

const HIGHLIGHT_HINT_KEY = "reader-highlight-hint-seen";

function openUrlExternally(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    void WebBrowser.openBrowserAsync(url);
  } else if (
    url.startsWith("mailto:") ||
    url.startsWith("tel:") ||
    url.startsWith("sms:")
  ) {
    void Linking.openURL(url);
  }
  // Ignore javascript: and other schemes
}

export function BookmarkLinkBrowserPreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  const bookmarkUrl = bookmark.content.url;

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      const bookmarkOrigin = new URL(bookmarkUrl).origin;
      if (request.url.startsWith(bookmarkOrigin)) {
        return true;
      }
      // Embeds, trackers and redirects load in place. Only a person tapping a
      // link should open something else, or a captcha frame can pop up a sheet.
      if (!request.isTopFrame || request.navigationType !== "click") {
        return true;
      }
      openUrlExternally(request.url);
      return false;
    },
    [bookmarkUrl],
  );

  return (
    <WebView
      startInLoadingState={true}
      mediaPlaybackRequiresUserAction={true}
      source={{ uri: bookmarkUrl }}
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
    />
  );
}

export function BookmarkLinkPdfPreview({ bookmark }: { bookmark: ZBookmark }) {
  const { t } = useTranslation();
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  const asset = bookmark.assets.find((r) => r.assetType == "pdf");

  const assetSource = useAssetUrl(asset?.id ?? "");

  if (!asset) {
    return (
      <View className="flex-1 bg-background">
        <Text>{t("bookmarks.asset_no_pdf")}</Text>
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
  const { t } = useTranslation();
  const actions = useCommonActions();
  const { isDarkColorScheme: isDark, colors } = useColorScheme();
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const insets = useSafeAreaInsets();
  const { settings: readerSettings } = useReaderSettings();
  const { settings } = useAppSettings();
  const api = useTRPC();
  const offlineHtmlContent = useOfflineArticleContent(
    getOfflineLibraryScope(settings),
    bookmark.id,
  );

  const {
    data: bookmarkWithContent,
    error,
    refetch,
  } = useQuery(
    api.bookmarks.getBookmark.queryOptions({
      bookmarkId: bookmark.id,
      includeContent: true,
    }),
  );
  // The offline body is stored on its own, so fold it back into the bookmark
  // this component was already handed rather than reading the saved metadata.
  const displayedBookmarkWithContent = useMemo(() => {
    if (bookmarkWithContent) {
      return bookmarkWithContent;
    }
    if (
      offlineHtmlContent === undefined ||
      bookmark.content.type !== BookmarkTypes.LINK
    ) {
      return undefined;
    }
    return {
      ...bookmark,
      content: { ...bookmark.content, htmlContent: offlineHtmlContent },
    };
  }, [bookmark, bookmarkWithContent, offlineHtmlContent]);

  const { data: highlights } = useQuery(
    api.highlights.getForBookmark.queryOptions({
      bookmarkId: bookmark.id,
    }),
  );

  const { toast } = useToast();
  const { somethingWentWrong } = useCommonStrings();
  // Closing the dock and selecting again retries.
  const { mutate: createHighlight } = useCreateHighlight({
    onError: () =>
      toast({
        message: somethingWentWrong,
        variant: "destructive",
        showProgress: false,
      }),
  });
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

  // Leaving the reader tears down its web view before it can report back, so
  // save the last position it told us about.
  const lastPosition = useRef<ReadingPosition | null>(null);
  const saveLastPosition = useRef(onSavePosition);
  saveLastPosition.current = onSavePosition;
  useEffect(
    () => () => {
      if (lastPosition.current && lastPosition.current.offset > 0) {
        saveLastPosition.current(lastPosition.current);
      }
    },
    [],
  );

  const dockLabels = useMemo(
    () => ({
      chooseColor: t("highlights.dock_choose_color"),
      saved: t("highlights.dock_saved"),
      colorGroup: t("highlights.dock_color_group"),
      colors: {
        yellow: t("highlights.dock_color_yellow"),
        red: t("highlights.dock_color_red"),
        green: t("highlights.dock_color_green"),
        blue: t("highlights.dock_color_blue"),
      },
      deleteHighlight: t("highlights.dock_delete"),
      saveNote: t("highlights.dock_save_note"),
      close: actions.close,
      addNote: t("highlights.dock_add_note"),
    }),
    [t, actions.close],
  );

  // Nothing on screen says selecting text can create a highlight, so say it once.
  useEffect(() => {
    if (highlightId) {
      return;
    }
    void AsyncStorage.getItem(HIGHLIGHT_HINT_KEY).then((seen) => {
      if (!seen) {
        void AsyncStorage.setItem(HIGHLIGHT_HINT_KEY, "1");
        toast({
          message: t("bookmarks.highlight_tip"),
          duration: 4000,
          showProgress: false,
        });
      }
    });
  }, []);

  const [isTitleScrolledAway, setIsTitleScrolledAway] = useState(false);
  const setReaderChromeHidden = useContext(ReaderChromeContext);
  const lastOffsetForDirection = useRef(0);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  const handleLinkPress = useCallback((url: string) => {
    openUrlExternally(url);
  }, []);

  const handleImagePress = useCallback((src: string) => {
    setViewingImage(src);
  }, []);

  if (!displayedBookmarkWithContent) {
    return <QueryPageState error={error} onRetry={refetch} />;
  }

  if (displayedBookmarkWithContent.content.type !== BookmarkTypes.LINK) {
    throw new Error("Wrong content type rendered");
  }

  // Same as the screen behind it, so short articles don't end in a seam.
  const readerBackground = isDark ? "#000000" : "#f2f2f7";
  const contentStyle: React.CSSProperties = {
    fontFamily: WEBVIEW_FONT_FAMILIES[readerSettings.fontFamily],
    fontSize: `${readerSettings.fontSize}px`,
    lineHeight: String(readerSettings.lineHeight),
    color: isDark ? "#e5e7eb" : "#374151",
    padding: "16px",
    background: readerBackground,
    // Keep lines at a readable length on tablets.
    maxWidth: `${READABLE_CONTENT_MAX_WIDTH}px`,
    margin: "0 auto",
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerTitle: isTitleScrolledAway
            ? getBookmarkDisplayTitle(bookmark)
            : "",
        }}
      />
      <ImageView
        visible={!!viewingImage}
        imageIndex={0}
        onRequestClose={() => setViewingImage(null)}
        doubleTapToZoomEnabled={true}
        images={viewingImage ? [{ uri: viewingImage }] : []}
      />
      {showBanner && !highlightId && (
        <View className="flex-row items-center gap-2 border-b border-border bg-background px-4 py-2">
          <BookOpen size={16} className="text-muted-foreground" />
          <Text className="flex-1 text-sm text-muted-foreground">
            {bannerPercent && bannerPercent > 0
              ? t("bookmarks.reader_continue_from", { percent: bannerPercent })
              : t("bookmarks.reader_continue_plain")}
          </Text>
          <TouchableOpacity
            onPress={onContinue}
            className="rounded-md bg-primary px-3 py-1"
          >
            <Text className="text-xs font-medium text-primary-foreground">
              {t("bookmarks.reader_continue")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDismiss} className="p-1">
            <X size={14} className="text-muted-foreground" />
          </TouchableOpacity>
        </View>
      )}
      <BookmarkHtmlHighlighterDom
        htmlContent={displayedBookmarkWithContent.content.htmlContent ?? ""}
        contentStyle={contentStyle}
        isDark={isDark}
        highlights={highlights?.highlights ?? []}
        readingProgressOffset={readingProgressOffset}
        readingProgressAnchor={readingProgressAnchor}
        // Coming from a highlight, the highlight decides where to open.
        restoreReadingPosition={highlightId ? false : restorePosition}
        focusHighlightId={highlightId}
        progressColor={colors.primary}
        fadeBottom={shouldUseGlassPill}
        onPageTap={() => setReaderChromeHidden(false)}
        articleTitle={getBookmarkDisplayTitle(bookmark)}
        articleSource={getDisplayHost(displayedBookmarkWithContent.content.url)}
        // Clears the floating reader toolbar, which overlays the content.
        dockFormAt={shouldUseGlassPill ? insets.bottom + 68 : 12}
        dockLabels={dockLabels}
        onSavePosition={onSavePosition}
        onScrollPositionChange={(position) => {
          lastPosition.current = position;
          setIsTitleScrolledAway(position.percent > 2);
          const previousOffset = lastOffsetForDirection.current;
          lastOffsetForDirection.current = position.offset;
          if (position.percent >= 98 || position.percent <= 1) {
            setReaderChromeHidden(false);
          } else if (Math.abs(position.offset - previousOffset) >= 8) {
            setReaderChromeHidden(position.offset > previousOffset);
          }
          onScrollPositionChange(position);
        }}
        onLinkPress={handleLinkPress}
        onImagePress={handleImagePress}
        onHighlight={(h) =>
          createHighlight({
            startOffset: h.startOffset,
            endOffset: h.endOffset,
            color: h.color,
            bookmarkId: bookmark.id,
            text: h.text,
            prefix: h.prefix ?? null,
            suffix: h.suffix ?? null,
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
          Alert.alert(
            t("highlights.delete_title"),
            t("highlights.delete_article_unaffected"),
            [
              { text: actions.cancel, style: "cancel" },
              {
                text: t("bookmark_actions.delete"),
                style: "destructive",
                onPress: () => deleteHighlight({ highlightId: h.id }),
              },
            ],
          )
        }
        dom={{
          scrollEnabled: true,
          style: { backgroundColor: readerBackground },
        }}
      />
    </View>
  );
}

export function BookmarkLinkArchivePreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { t } = useTranslation();
  const asset =
    bookmark.assets.find((r) => r.assetType == "precrawledArchive") ??
    bookmark.assets.find((r) => r.assetType == "fullPageArchive");

  const assetSource = useAssetUrl(asset?.id ?? "");

  const originUri = assetSource.uri;
  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      // Allow loading the archive asset itself
      if (
        originUri &&
        (request.url === originUri || request.url.startsWith(originUri))
      ) {
        return true;
      }
      if (!request.isTopFrame || request.navigationType !== "click") {
        return true;
      }
      openUrlExternally(request.url);
      return false;
    },
    [originUri],
  );

  if (!asset) {
    return (
      <View className="flex-1 bg-background">
        <Text>{t("bookmarks.asset_no_archive")}</Text>
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
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
    />
  );
}

export function BookmarkLinkScreenshotPreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { t } = useTranslation();
  const asset = bookmark.assets.find((r) => r.assetType == "screenshot");

  const assetSource = useAssetUrl(asset?.id ?? "");
  const [imageZoom, setImageZoom] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);

  if (!asset) {
    return (
      <View className="flex-1 bg-background">
        <Text>{t("bookmarks.asset_no_screenshot")}</Text>
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
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          gap: 8,
        }}
      >
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={t("bookmarks.screenshot_zoom_label")}
          onPress={() => setImageZoom(true)}
        >
          <Image
            source={assetSource}
            style={{ width: "100%", aspectRatio }}
            contentFit="contain"
            onLoad={(event) => {
              const { width, height } = event.source;
              if (width > 0 && height > 0) {
                setAspectRatio(width / height);
              }
            }}
          />
        </Pressable>
        <Text variant="footnote" color="tertiary" className="text-center">
          {t("bookmarks.tap_to_zoom")}
        </Text>
      </ScrollView>
    </View>
  );
}
