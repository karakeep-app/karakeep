import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileTypeFromBlob, supportedMimeTypes } from "file-type";
import { bodyLimit } from "hono/body-limit";

import { assets, AssetTypes } from "@karakeep/db/schema";
import {
  newAssetId,
  QuotaService,
  saveAssetFromFile,
  StorageQuotaError,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared-server";
import serverConfig from "@karakeep/shared/config";
import { AuthedContext } from "@karakeep/trpc";

const MAX_UPLOAD_SIZE_BYTES = serverConfig.maxAssetSizeMb * 1024 * 1024;

// Rejects oversized uploads before the multipart body gets buffered in memory.
// The extra 1MiB leaves room for the multipart framing and other form fields,
// the exact file size is still enforced in uploadAsset.
export const uploadBodyLimit = bodyLimit({
  maxSize: MAX_UPLOAD_SIZE_BYTES + 1024 * 1024,
  onError: (c) => c.json({ error: "Asset is too big" }, 413),
});

// Helper to convert Web Stream to Node Stream (requires Node >= 16.5 / 14.18)
export function webStreamToNode(
  webStream: ReadableStream<Uint8Array>,
): Readable {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
  return Readable.fromWeb(webStream as any); // Type assertion might be needed
}

export function toWebReadableStream(
  nodeStream: NodeJS.ReadableStream,
): ReadableStream<Uint8Array> {
  // Readable.toWeb propagates backpressure and destroys the source on cancel,
  // so slow or disconnected clients don't cause the whole asset to be read.
  return Readable.toWeb(
    nodeStream as Readable,
  ) as unknown as ReadableStream<Uint8Array>;
}

export async function uploadAsset(
  user: AuthedContext["user"],
  db: AuthedContext["db"],
  formData: { file: File } | { image: File },
): Promise<
  | { error: string; status: 400 | 413 | 403 }
  | {
      assetId: string;
      contentType: string;
      fileName: string;
      size: number;
    }
> {
  let data: File;
  if ("file" in formData) {
    data = formData.file;
  } else {
    data = formData.image;
  }

  const detectedType = await fileTypeFromBlob(data);
  const fallbackType =
    data.type && data.type.trim().length > 0 ? data.type : null;
  // Security: reject browser-provided MIME when we cannot sniff a valid type.
  if (fallbackType && supportedMimeTypes.has(fallbackType) && !detectedType) {
    return { error: "Unsupported asset type", status: 400 };
  }
  const contentType =
    detectedType?.mime ?? fallbackType ?? "application/octet-stream";

  // Replace all non-ascii characters with underscores
  const fileName = data.name.replace(/[^\x20-\x7E]/g, "_");
  if (!SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType)) {
    return { error: "Unsupported asset type", status: 400 };
  }
  if (data.size > MAX_UPLOAD_SIZE_BYTES) {
    return { error: "Asset is too big", status: 413 };
  }

  let quotaApproved;
  try {
    quotaApproved = await QuotaService.checkStorageQuota(
      db,
      user.id,
      data.size,
    );
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      return { error: error.message, status: 403 };
    }
    throw error;
  }

  let tempFilePath: string | undefined;

  try {
    const assetId = newAssetId();
    tempFilePath = path.join(os.tmpdir(), `karakeep-upload-${assetId}`);
    await pipeline(
      webStreamToNode(data.stream()),
      fs.createWriteStream(tempFilePath),
    );
    const [assetDb] = await db
      .insert(assets)
      .values({
        id: assetId,
        // Initially, uploads are uploaded for unknown purpose
        // And without an attached bookmark.
        assetType: AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId: user.id,
        contentType,
        size: data.size,
        fileName,
      })
      .returning();

    await saveAssetFromFile({
      userId: user.id,
      assetId: assetDb.id,
      assetPath: tempFilePath,
      metadata: { contentType, fileName },
      quotaApproved,
    });

    return {
      assetId: assetDb.id,
      contentType,
      size: data.size,
      fileName,
    };
  } finally {
    if (
      tempFilePath &&
      (await fs.promises
        .access(tempFilePath)
        .then(() => true)
        .catch(() => false))
    ) {
      await fs.promises.unlink(tempFilePath).catch(() => ({}));
    }
  }
}
