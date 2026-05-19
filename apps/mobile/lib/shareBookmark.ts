import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { BookmarkTypes, ZBookmark } from "@karakeep/shared/types/bookmarks";

import { useToast } from "@/components/ui/Toast";
import type { Settings } from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";

type ToastFn = ReturnType<typeof useToast>["toast"];

export async function shareBookmark(
  bookmark: ZBookmark,
  settings: Settings,
  toast: ToastFn,
) {
  try {
    switch (bookmark.content.type) {
      case BookmarkTypes.LINK:
        await Share.share({
          url: bookmark.content.url,
          message: bookmark.content.url,
        });
        break;

      case BookmarkTypes.TEXT:
        await Clipboard.setStringAsync(bookmark.content.text);
        toast({
          message: "Text copied to clipboard",
          showProgress: false,
        });
        break;

      case BookmarkTypes.ASSET: {
        const canShare = await Sharing.isAvailableAsync();
        const isShareable =
          canShare &&
          (bookmark.content.assetType === "image" ||
            bookmark.content.assetType === "pdf");

        if (!isShareable) {
          toast({
            message: "Sharing is not available for this file type",
            variant: "destructive",
            showProgress: false,
          });
          break;
        }

        const assetUrl = `${settings.address}/api/assets/${bookmark.content.assetId}`;
        const fileUri =
          bookmark.content.assetType === "pdf"
            ? `${FileSystem.documentDirectory}${bookmark.content.fileName || "document.pdf"}`
            : `${FileSystem.documentDirectory}temp_image.jpg`;
        const downloadResult = await FileSystem.downloadAsync(
          assetUrl,
          fileUri,
          {
            headers: buildApiHeaders(settings.apiKey, settings.customHeaders),
          },
        );
        if (downloadResult.status !== 200) {
          throw new Error("Failed to download file");
        }
        try {
          await Sharing.shareAsync(
            downloadResult.uri,
            bookmark.content.assetType === "pdf"
              ? { mimeType: "application/pdf", UTI: "com.adobe.pdf" }
              : undefined,
          );
        } finally {
          await FileSystem.deleteAsync(downloadResult.uri, {
            idempotent: true,
          });
        }
        break;
      }
    }
  } catch (error) {
    console.error("Share error:", error);
    toast({
      message: "Failed to share",
      variant: "destructive",
      showProgress: false,
    });
  }
}
