import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import ImageView from "react-native-image-viewing";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { WebViewSourceUri } from "react-native-webview/lib/WebViewTypes";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { useReaderSettings, WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { api } from "@/lib/trpc";
import { useColorScheme } from "@/lib/useColorScheme";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";
import { READING_PROGRESS_WEBVIEW_JS } from "@karakeep/shared/utils/reading-progress-webview.generated";

import FullPageError from "../FullPageError";
import FullPageSpinner from "../ui/FullPageSpinner";
import BookmarkAssetImage from "./BookmarkAssetImage";
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

/**
 * Builds the reading progress injection script for WebView.
 *
 * Uses shared reading progress functions from @karakeep/shared to ensure
 * consistent behavior between web and mobile. The shared code includes
 * whitespace normalization and anchor text support for reliable position tracking.
 *
 * @param initialOffset - The saved reading position offset to restore
 * @param initialAnchor - The saved anchor text for position verification
 * @returns JavaScript string to inject into WebView
 */
function buildReadingProgressScript(
  initialOffset: number,
  initialAnchor: string | null,
): string {
  return `
    (function() {
      // Core reading progress functions from @karakeep/shared (bundled IIFE)
      // These are shared with the web implementation for consistency
      ${READING_PROGRESS_WEBVIEW_JS}

      // Extract functions from the IIFE global
      var getReadingPosition = __readingProgress.getReadingPosition;
      var scrollToReadingPosition = __readingProgress.scrollToReadingPosition;

      // Report current position to React Native
      function reportProgress() {
        var position = getReadingPosition(document.body);
        if (position && position.offset > 0) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SCROLL_PROGRESS',
            offset: position.offset,
            anchor: position.anchor,
            percent: position.percent
          }));
        }
      }

      // Restore position immediately (no setTimeout needed for inline HTML -
      // DOM is ready when injectedJavaScript runs)
      var initialOffset = ${initialOffset};
      var initialAnchor = ${JSON.stringify(initialAnchor)};
      if (initialOffset && initialOffset > 0) {
        scrollToReadingPosition(document.body, initialOffset, 'instant', initialAnchor);
      }
      // Show content after scroll restoration (or immediately if no scroll needed)
      document.body.style.opacity = '1';

      // Report on scroll (throttled to prevent jank from expensive DOM operations)
      var lastScrollTime = 0;
      window.addEventListener('scroll', function() {
        var now = Date.now();
        if (now - lastScrollTime < 150) {
          return;
        }
        lastScrollTime = now;
        reportProgress();
      });

      // Also report periodically as backup
      setInterval(reportProgress, 10000);

      true; // Required for injectedJavaScript
    })();
  `;
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
  const lastSavedOffset = useRef<number | null>(null);
  const currentPosition = useRef<{
    offset: number;
    anchor: string;
    percent: number;
  } | null>(null);

  const {
    data: bookmarkWithContent,
    error,
    isLoading,
    refetch,
  } = api.bookmarks.getBookmark.useQuery({
    bookmarkId: bookmark.id,
    includeContent: true,
  });

  const apiUtils = api.useUtils();
  const { mutate: updateProgress } =
    api.bookmarks.updateReadingProgress.useMutation({
      onSuccess: () => {
        apiUtils.bookmarks.getBookmark.invalidate({ bookmarkId: bookmark.id });
      },
      onError: (error) => {
        console.error("[ReadingProgress] Failed to save progress:", error);
      },
    });

  // Save progress function
  const saveProgress = useCallback(() => {
    if (currentPosition.current === null) return;

    const { offset, anchor, percent } = currentPosition.current;

    // Only save if offset has changed
    if (lastSavedOffset.current !== offset) {
      lastSavedOffset.current = offset;
      updateProgress({
        bookmarkId: bookmark.id,
        readingProgressOffset: offset,
        readingProgressAnchor: anchor,
        readingProgressPercent: percent,
      });
    }
  }, [bookmark.id, updateProgress]);

  // Handle messages from WebView
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "SCROLL_PROGRESS" && typeof data.offset === "number") {
        currentPosition.current = {
          offset: data.offset,
          anchor: typeof data.anchor === "string" ? data.anchor : "",
          percent: typeof data.percent === "number" ? data.percent : 0,
        };
      }
    } catch (error) {
      console.warn("[ReadingProgress] Failed to parse WebView message:", error);
    }
  }, []);

  // Save on AppState change (app going to background)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "background" || status === "inactive") {
        saveProgress();
      }
    });

    return () => {
      // Save on unmount
      saveProgress();
      subscription.remove();
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

  const fontFamily = WEBVIEW_FONT_FAMILIES[readerSettings.fontFamily];
  const fontSize = readerSettings.fontSize;
  const lineHeight = readerSettings.lineHeight;

  // Get initial position for restoration
  const initialOffset = bookmarkWithContent.content.readingProgressOffset ?? 0;
  const initialAnchor =
    bookmarkWithContent.content.readingProgressAnchor ?? null;

  // Build the reading progress script with initial position
  const injectedJS = buildReadingProgressScript(initialOffset, initialAnchor);

  return (
    <View className="flex-1 bg-background">
      <WebView
        originWhitelist={["*"]}
        source={{
          html: `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <style>
                    body {
                      font-family: ${fontFamily};
                      font-size: ${fontSize}px;
                      line-height: ${lineHeight};
                      color: ${isDark ? "#e5e7eb" : "#374151"};
                      margin: 0;
                      padding: 16px;
                      background: ${isDark ? "#000000" : "#ffffff"};
                      ${initialOffset > 0 ? "opacity: 0;" : ""}
                    }
                    p { margin: 0 0 1em 0; }
                    h1, h2, h3, h4, h5, h6 { margin: 1.5em 0 0.5em 0; line-height: 1.2; }
                    img { max-width: 100%; height: auto; border-radius: 8px; }
                    a { color: #3b82f6; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    blockquote {
                      border-left: 4px solid ${isDark ? "#374151" : "#e5e7eb"};
                      margin: 1em 0;
                      padding-left: 1em;
                      color: ${isDark ? "#9ca3af" : "#6b7280"};
                    }
                    pre, code {
                      font-family: ui-monospace, Menlo, Monaco, 'Courier New', monospace;
                      background: ${isDark ? "#1f2937" : "#f3f4f6"};
                    }
                    pre {
                      padding: 1em;
                      border-radius: 6px;
                      overflow-x: auto;
                    }
                    code {
                      padding: 0.2em 0.4em;
                      border-radius: 3px;
                      font-size: 0.9em;
                    }
                    pre code {
                      padding: 0;
                      background: none;
                    }
                  </style>
                </head>
                <body>
                  ${bookmarkWithContent.content.htmlContent}
                </body>
              </html>
            `,
        }}
        style={{
          flex: 1,
          backgroundColor: isDark ? "#000000" : "#ffffff",
        }}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        decelerationRate={0.998}
        injectedJavaScript={injectedJS}
        onMessage={handleMessage}
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
          className="h-full w-full object-contain"
        />
      </Pressable>
    </View>
  );
}
