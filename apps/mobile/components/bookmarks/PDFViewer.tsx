import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import Pdf from "react-native-pdf";
import { Text } from "@/components/ui/Text";
import { useQuery } from "@tanstack/react-query";
import { useColorScheme } from "nativewind";

interface PDFViewerProps {
  source: string;
  headers?: Record<string, string>;
}

export function PDFViewer({ source, headers }: PDFViewerProps) {
  const [pdfRenderError, setPdfRenderError] = useState<string | null>(null);
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
      let errorMessage = "Failed to download PDF";
      if (downloadError.message.includes("Network request failed")) {
        errorMessage = "Network error. Please check your connection.";
      } else if (
        downloadError.message.includes("401") ||
        downloadError.message.includes("403")
      ) {
        errorMessage = "Authentication failed. Please sign in again.";
      } else if (downloadError.message.includes("404")) {
        errorMessage = "PDF not found.";
      }
      return errorMessage;
    }
    if (pdfRenderError) {
      return pdfRenderError;
    }
    return null;
  }, [downloadError, pdfRenderError]);

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
            Downloading PDF...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Pdf
        style={StyleSheet.absoluteFillObject}
        source={{ uri: `file://${localPath}`, cache: true }}
        spacing={16}
        maxScale={3}
        onLoadComplete={() => ({})}
        onError={() => setPdfRenderError("Failed to render PDF")}
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
    ...StyleSheet.absoluteFillObject,
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
