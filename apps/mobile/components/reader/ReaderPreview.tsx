import { forwardRef, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import WebView from "react-native-webview";
import { WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { useColorScheme } from "@/lib/useColorScheme";

import { ZReaderFontFamily } from "@karakeep/shared/types/users";

const PREVIEW_TEXT =
  "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!";

export interface ReaderPreviewRef {
  updateStyles: (
    fontFamily: ZReaderFontFamily,
    fontSize: number,
    lineHeight: number,
  ) => void;
}

interface ReaderPreviewProps {
  initialFontFamily: ZReaderFontFamily;
  initialFontSize: number;
  initialLineHeight: number;
}

export const ReaderPreview = forwardRef<ReaderPreviewRef, ReaderPreviewProps>(
  ({ initialFontFamily, initialFontSize, initialLineHeight }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const { isDarkColorScheme: isDark } = useColorScheme();

    const fontFamily = WEBVIEW_FONT_FAMILIES[initialFontFamily];
    const textColor = isDark ? "#e5e7eb" : "#374151";
    const bgColor = isDark ? "#000000" : "#ffffff";

    useImperativeHandle(ref, () => ({
      updateStyles: (
        newFontFamily: ZReaderFontFamily,
        newFontSize: number,
        newLineHeight: number,
      ) => {
        const cssFontFamily = WEBVIEW_FONT_FAMILIES[newFontFamily];
        webViewRef.current?.injectJavaScript(`
          window.updateStyles("${cssFontFamily}", ${newFontSize}, ${newLineHeight});
          true;
        `);
      },
    }));

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              height: 100%;
              overflow: hidden;
            }
            body {
              font-family: ${fontFamily};
              font-size: ${initialFontSize}px;
              line-height: ${initialLineHeight};
              color: ${textColor};
              background: ${bgColor};
              padding: 16px;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
          </style>
          <script>
            window.updateStyles = function(fontFamily, fontSize, lineHeight) {
              document.body.style.fontFamily = fontFamily;
              document.body.style.fontSize = fontSize + 'px';
              document.body.style.lineHeight = lineHeight;
            };
          </script>
        </head>
        <body>
          ${PREVIEW_TEXT}
        </body>
      </html>
    `;

    return (
      <View className="h-32 w-full overflow-hidden rounded-lg">
        <WebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={{ html }}
          style={{
            flex: 1,
            backgroundColor: bgColor,
          }}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        />
      </View>
    );
  },
);

ReaderPreview.displayName = "ReaderPreview";
