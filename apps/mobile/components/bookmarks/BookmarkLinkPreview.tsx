import { useState } from "react";
import { Pressable, View } from "react-native";
import ImageView from "react-native-image-viewing";
import WebView from "react-native-webview";
import { WebViewSourceUri } from "react-native-webview/lib/WebViewTypes";
import { Text } from "@/components/ui/Text";
import { useAssetUrl } from "@/lib/hooks";
import { useReaderSettings, WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { api } from "@/lib/trpc";
import { useColorScheme } from "@/lib/useColorScheme";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

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

  const {
    data: bookmarkWithContent,
    error,
    isLoading,
    refetch,
  } = api.bookmarks.getBookmark.useQuery({
    bookmarkId: bookmark.id,
    includeContent: true,
  });

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
