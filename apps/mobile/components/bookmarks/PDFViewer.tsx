import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import Pdf from "react-native-pdf";
import { Text } from "@/components/ui/Text";
import { useTranslation } from "@/lib/i18n/hooks";
import { useQuery } from "@tanstack/react-query";
import { useColorScheme } from "nativewind";

interface PDFViewerProps {
  source: string;
  headers?: Record<string, string>;
}

export function PDFViewer({ source, headers }: PDFViewerProps) {
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
  const { t } = useTranslation();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = {
    background: isDark ? "#000" : "#fff",
    foreground: isDark ? "#fff" : "#000",
    mutedForeground: isDark ? "#888" : "#666",
  };

  const {
    data: localPath,
    isLoading,
    error: downloadError,
  } = useQuery({
    queryKey: ["pdf", source],
    queryFn: async () => {
      // Create a temporary filename
      const fileName = `temp_${Date.now()}.pdf`;
      const { dirs } = ReactNativeBlobUtil.fs;
      const path = `${dirs.DocumentDir}/${fileName}`;

      const response = await ReactNativeBlobUtil.config({
        fileCache: true,
        path,
      }).fetch("GET", source, headers ?? {});
      return response.path();
    },
    enabled: !!source,
  });

  // Merge download and render errors
  const error = useMemo(() => {
    if (downloadError) {
      let errorMessage = t("bookmarks.failed_download_pdf");
      if (downloadError.message.includes("Network request failed")) {
        errorMessage = t("bookmarks.pdf_network_error");
      } else if (
        downloadError.message.includes("401") ||
        downloadError.message.includes("403")
      ) {
        errorMessage = t("bookmarks.pdf_auth_error");
      } else if (downloadError.message.includes("404")) {
        errorMessage = t("bookmarks.pdf_not_found");
      }
      return errorMessage;
    }
    if (pdfRenderError) {
      return t("bookmarks.failed_render_pdf");
    }
    return null;
  }, [downloadError, pdfRenderError, t]);

  // Cleanup function to remove temporary file on unmount
  useEffect(() => {
    return () => {
      if (localPath) {
        ReactNativeBlobUtil.fs.unlink(localPath).catch(() => ({}));
      }
    };
  }, [source, headers]);

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (isLoading || !localPath) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.foreground} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            {t("bookmarks.downloading_pdf")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pdf
        style={StyleSheet.absoluteFill}
        source={{ uri: `file://${localPath}`, cache: true }}
        spacing={16}
        maxScale={3}
        onLoadComplete={() => ({})}
        onError={() => setPdfRenderError("render")}
        trustAllCerts={false}
        renderActivityIndicator={() => (
          <ActivityIndicator size="large" color={colors.foreground} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    padding: 20,
  },
});
