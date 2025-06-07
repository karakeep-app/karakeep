import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import Pdf from "react-native-pdf";
import { useColorScheme } from "nativewind";

interface PDFViewerProps {
  source: string;
  headers?: Record<string, string>;
}

export function PDFViewer({ source, headers }: PDFViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localPath, setLocalPath] = useState<string | null>(null);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = {
    background: isDark ? "#000" : "#fff",
    foreground: isDark ? "#fff" : "#000",
    mutedForeground: isDark ? "#888" : "#666",
  };

  useEffect(() => {
    let isCancelled = false;
    let downloadedPath: string | null = null;

    // Download PDF to temporary location
    const downloadPDF = async () => {
      try {
        setLoading(true);
        setError(null);

        // Create a temporary filename
        const fileName = `temp_${Date.now()}.pdf`;
        const { dirs } = ReactNativeBlobUtil.fs;
        const path = `${dirs.DocumentDir}/${fileName}`;

        // Download the PDF with authentication
        const response = await ReactNativeBlobUtil.config({
          fileCache: true,
          path: path,
        }).fetch("GET", source, headers ?? {});

        downloadedPath = response.path();
        const responseInfo = response.info() as {
          headers?: Record<string, string>;
          status?: number;
        };
        // Headers might be case-sensitive, check both variants
        const contentType =
          responseInfo?.headers?.["content-type"] ??
          responseInfo?.headers?.["Content-Type"] ??
          "";
        const _status = responseInfo?.status; // Status captured for potential future use

        // Check if response is actually a PDF
        const validPDFTypes = ["application/pdf", "application/x-pdf"];
        if (
          !validPDFTypes.some((type) =>
            contentType.toLowerCase().includes(type),
          )
        ) {
          throw new Error(
            `Expected PDF content type but got "${contentType}". The file might not be a PDF.`,
          );
        }

        // Verify file exists
        const exists = await ReactNativeBlobUtil.fs.exists(downloadedPath);

        if (!exists) {
          throw new Error("Downloaded file does not exist");
        }

        if (!isCancelled) {
          setLocalPath(downloadedPath);
          setLoading(false);
        }
      } catch (err) {
        console.error("PDF Download Error:", err);
        if (!isCancelled) {
          let errorMessage = "Failed to download PDF";
          if (err instanceof Error) {
            if (err.message.includes("Network request failed")) {
              errorMessage = "Network error. Please check your connection.";
            } else if (
              err.message.includes("401") ||
              err.message.includes("403")
            ) {
              errorMessage = "Authentication failed. Please sign in again.";
            } else if (err.message.includes("404")) {
              errorMessage = "PDF not found.";
            }
          }
          setError(errorMessage);
          setLoading(false);
        }
      }
    };

    if (source) {
      downloadPDF();
    }

    // Cleanup function to remove temporary file
    return () => {
      isCancelled = true;
      if (downloadedPath) {
        ReactNativeBlobUtil.fs.unlink(downloadedPath).catch(() => {
          // Ignore cleanup errors
        });
      }
    };
  }, [source, headers]);

  const handleError = (e: unknown) => {
    console.error("PDF Render Error:", e);
    setError("Failed to render PDF");
    setLoading(false);
  };

  const handleLoad = () => {
    // PDF loaded successfully
  };

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (loading || !localPath) {
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

  try {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Pdf
          style={StyleSheet.absoluteFillObject}
          source={{ uri: `file://${localPath}`, cache: true }}
          spacing={16}
          maxScale={3}
          onLoadComplete={handleLoad}
          onError={handleError}
          trustAllCerts={false}
          renderActivityIndicator={() => (
            <ActivityIndicator size="large" color={colors.foreground} />
          )}
        />
      </View>
    );
  } catch (err) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.foreground }]}>
          PDF viewer not available. Please rebuild the app.
        </Text>
      </View>
    );
  }
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
