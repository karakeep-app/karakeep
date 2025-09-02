import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import { assets, AssetTypes } from "@karakeep/db/schema";
import {
  newAssetId,
  saveAssetFromFile,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared/assetdb";
import serverConfig from "@karakeep/shared/config";
import { AuthedContext } from "@karakeep/trpc";
import {
  checkStorageQuota,
  StorageQuotaError,
} from "@karakeep/trpc/lib/storageQuota";

const MAX_UPLOAD_SIZE_BYTES = serverConfig.maxAssetSizeMb * 1024 * 1024;

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
  const reader = nodeStream as unknown as Readable;

  return new ReadableStream({
    start(controller) {
      reader.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      reader.on("end", () => controller.close());
      reader.on("error", (err) => controller.error(err));
    },
  });
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

  const contentType = data.type;
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
    quotaApproved = await checkStorageQuota(db, user.id, data.size);
  } catch (error) {
    if (error instanceof StorageQuotaError) {
      return { error: error.message, status: 403 };
    }
    throw error;
  }

  let tempFilePath: string | undefined;

  try {
    tempFilePath = path.join(os.tmpdir(), `karakeep-upload-${Date.now()}`);
    await pipeline(
      webStreamToNode(data.stream()),
      fs.createWriteStream(tempFilePath),
    );
    const [assetDb] = await db
      .insert(assets)
      .values({
        id: newAssetId(),
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
