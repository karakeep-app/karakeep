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

import { useWhoAmI } from "@karakeep/shared-react/hooks/users";
import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import FullPageError from "../FullPageError";
import FullPageSpinner from "../ui/FullPageSpinner";
import BookmarkAssetImage from "./BookmarkAssetImage";

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

// JavaScript to inject into WebView for reading progress tracking
const READING_PROGRESS_SCRIPT = `
  (function() {
    // Find first visible paragraph and calculate text offset
    function getReadingPosition() {
      const paragraphs = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
      const viewportTop = 0;
      const viewportBottom = window.innerHeight;

      for (const p of paragraphs) {
        const rect = p.getBoundingClientRect();
        if (rect.bottom > viewportTop && rect.top < viewportBottom) {
          // Calculate text offset using TreeWalker
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let offset = 0;
          let node;
          while ((node = walker.nextNode())) {
            if (p.contains(node)) return offset;
            offset += (node.textContent || '').length;
          }
        }
      }
      return null;
    }

    // Scroll to text offset position
    function scrollToPosition(offset) {
      if (offset <= 0) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let currentOffset = 0;
      let node;
      while ((node = walker.nextNode())) {
        const nodeLength = (node.textContent || '').length;
        if (currentOffset + nodeLength >= offset) {
          let element = node.parentElement;
          while (element) {
            if (['P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE'].includes(element.tagName)) {
              element.scrollIntoView({ behavior: 'instant', block: 'start' });
              return;
            }
            element = element.parentElement;
          }
          break;
        }
        currentOffset += nodeLength;
      }
    }

    // Report current position to React Native
    function reportProgress() {
      const offset = getReadingPosition();
      if (offset !== null && offset > 0) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCROLL_PROGRESS', offset: offset }));
      }
    }

    // Restore position on load if initial offset is provided
    var initialOffset = INITIAL_OFFSET_PLACEHOLDER;
    if (initialOffset && initialOffset > 0) {
      setTimeout(function() { scrollToPosition(initialOffset); }, 100);
    }

    // Report on scroll end (debounced)
    var scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(reportProgress, 500);
    });

    // Also report periodically as backup
    setInterval(reportProgress, 10000);

    true; // Required for injectedJavaScript
  })();
`;

export function BookmarkLinkReaderPreview({
  bookmark,
}: {
  bookmark: ZBookmark;
}) {
  const { isDarkColorScheme: isDark } = useColorScheme();
  const { settings: readerSettings } = useReaderSettings();
  const { data: currentUser } = useWhoAmI();
  const webViewRef = useRef<WebView>(null);
  const lastSavedOffset = useRef<number | null>(null);
  const currentOffset = useRef<number | null>(null);

  const isOwner = currentUser?.id === bookmark.userId;

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
    });

  // Save progress function
  const saveProgress = useCallback(() => {
    if (!isOwner || currentOffset.current === null) return;

    // Only save if offset has meaningfully changed
    if (
      lastSavedOffset.current === null ||
      Math.abs(currentOffset.current - lastSavedOffset.current) > 100
    ) {
      lastSavedOffset.current = currentOffset.current;
      updateProgress({
        bookmarkId: bookmark.id,
        readingProgressOffset: currentOffset.current,
      });
    }
  }, [isOwner, bookmark.id, updateProgress]);

  // Handle messages from WebView
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "SCROLL_PROGRESS" && typeof data.offset === "number") {
        currentOffset.current = data.offset;
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save on AppState change (app going to background)
  useEffect(() => {
    if (!isOwner) return;

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
  }, [isOwner, saveProgress]);

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

  // Get initial offset for restoration
  const initialOffset = bookmarkWithContent.content.readingProgressOffset ?? 0;

  // Inject the reading progress script with the initial offset
  const injectedJS = isOwner
    ? READING_PROGRESS_SCRIPT.replace(
        "INITIAL_OFFSET_PLACEHOLDER",
        String(initialOffset),
      )
    : "true;";

  return (
    <View className="flex-1 bg-background">
      <WebView
        ref={webViewRef}
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
