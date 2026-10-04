import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import {
  getAssetUrl,
  humanFriendlyNameForAssertType,
} from "@karakeep/shared/utils/assetUtils";

import type { Settings } from "@/lib/settings";
import { buildApiHeaders } from "@/lib/utils";

const MIME_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "text/html": "html",
  "text/plain": "txt",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export async function downloadAttachment(
  asset: ZBookmark["assets"][number],
  settings: Settings,
) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Saving attachments is not available on this device");
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error("Temporary storage is not available on this device");
  }

  const directory = `${FileSystem.cacheDirectory}attachment-${Date.now()}-${Math.random().toString(36).slice(2)}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  try {
    const result = await FileSystem.downloadAsync(
      `${settings.address.replace(/\/$/, "")}${getAssetUrl(asset.id)}`,
      `${directory}download`,
      { headers: buildApiHeaders(settings.apiKey, settings.customHeaders) },
    );
    if (result.status !== 200) {
      throw new Error("Failed to download attachment. Please try again.");
    }

    const contentType =
      result.mimeType ??
      Object.entries(result.headers).find(
        ([name]) => name.toLowerCase() === "content-type",
      )?.[1];
    const mimeType = contentType?.split(";")[0].trim().toLowerCase();
    const extension = mimeType ? MIME_EXTENSIONS[mimeType] : undefined;
    // Keep server-provided names inside the temporary directory.
    let fileName = (
      asset.fileName || humanFriendlyNameForAssertType(asset.assetType)
    )
      .replace(/[/\\:*?"<>|\p{Cc}]/gu, "_")
      .replace(/^\.+/, "_");
    if (!/\.[a-z0-9]+$/i.test(fileName) && extension) {
      fileName += `.${extension}`;
    }
    const uri = `${directory}${encodeURIComponent(fileName)}`;
    await FileSystem.moveAsync({ from: result.uri, to: uri });
    await Sharing.shareAsync(uri, {
      dialogTitle: "Save or share attachment",
      ...(mimeType ? { mimeType } : {}),
    });
  } finally {
    await FileSystem.deleteAsync(directory, { idempotent: true });
  }
}
