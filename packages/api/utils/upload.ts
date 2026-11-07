import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { eq } from "drizzle-orm";
import { fileTypeFromBlob, supportedMimeTypes } from "file-type";
import { bodyLimit } from "hono/body-limit";

import { assets, AssetTypes } from "@karakeep/db/schema";
import {
  deleteAsset,
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
  formData: ({ file: File } | { image: File }) & { purpose?: "attachment" },
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

  if (data.size > MAX_UPLOAD_SIZE_BYTES) {
    return { error: "Asset is too big", status: 413 };
  }

  const detectedType = await fileTypeFromBlob(data);
  const declaredType = data.type.split(";", 1)[0].trim().toLowerCase();
  const fallbackType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(
    declaredType,
  )
    ? declaredType
    : null;
  // Preview formats still require a recognized signature. Generic attachment
  // declarations need not be detectable: they can only be downloaded.
  if (
    fallbackType &&
    supportedMimeTypes.has(fallbackType) &&
    !detectedType &&
    (formData.purpose !== "attachment" ||
      SUPPORTED_UPLOAD_ASSET_TYPES.has(fallbackType))
  ) {
    return { error: "Unsupported asset type", status: 400 };
  }
  const contentType =
    detectedType?.mime ?? fallbackType ?? "application/octet-stream";

  // Only positively detected preview formats may render inline. Unsniffable
  // text (including HTML/SVG) and unknown binaries remain opaque downloads.
  const downloadOnly =
    formData.purpose === "attachment" &&
    (!detectedType || !SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType));
  const fileName = data.name;
  if (!downloadOnly && !SUPPORTED_UPLOAD_ASSET_TYPES.has(contentType)) {
    return { error: "Unsupported asset type", status: 400 };
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
        // Generic uploads are restricted to user attachments.
        // All uploads start without an attached bookmark.
        assetType: downloadOnly ? AssetTypes.USER_UPLOADED : AssetTypes.UNKNOWN,
        bookmarkId: null,
        userId: user.id,
        contentType,
        size: data.size,
        fileName,
      })
      .returning();

    try {
      await saveAssetFromFile({
        userId: user.id,
        assetId: assetDb.id,
        assetPath: tempFilePath,
        metadata: {
          contentType,
          fileName,
          ...(downloadOnly ? { downloadOnly: true } : {}),
        },
        quotaApproved,
      });
    } catch (error) {
      await db.delete(assets).where(eq(assets.id, assetDb.id));
      await deleteAsset({ userId: user.id, assetId: assetDb.id }).catch(
        () => ({}),
      );
      throw error;
    }

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
