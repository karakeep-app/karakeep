import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import WebView from "react-native-webview";
import { useTranslation } from "@/lib/i18n/hooks";
import { WEBVIEW_FONT_FAMILIES } from "@/lib/readerSettings";
import { useColorScheme } from "@/lib/useColorScheme";

import { ZReaderFontFamily } from "@karakeep/shared/types/users";

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
    const { t } = useTranslation();
    const previewText = t("settings.reader_preview_text")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

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

    // Update colors when theme changes
    useEffect(() => {
      webViewRef.current?.injectJavaScript(`
        document.body.style.color = "${textColor}";
        document.body.style.background = "${bgColor}";
        true;
      `);
    }, [isDark, textColor, bgColor]);

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
          ${previewText}
        </body>
      </html>
    `;

    return (
      <View
        className="h-40 w-full overflow-hidden rounded-xl"
        style={{ borderCurve: "continuous" }}
      >
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
