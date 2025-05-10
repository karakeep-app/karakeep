import * as fs from "fs";
import * as path from "path";
import { Glob } from "glob";
import { z } from "zod";

import serverConfig from "./config";
import logger from "./logger";

const ROOT_PATH = serverConfig.assetsDir;

export const enum ASSET_TYPES {
  IMAGE_JPEG = "image/jpeg",
  IMAGE_PNG = "image/png",
  IMAGE_WEBP = "image/webp",
  APPLICATION_PDF = "application/pdf",
  TEXT_HTML = "text/html",
  VIDEO_MP4 = "video/mp4",
  APPLICATION_WARC = "application/warc",
}

export const IMAGE_ASSET_TYPES: Set<string> = new Set<string>([
  ASSET_TYPES.IMAGE_JPEG,
  ASSET_TYPES.IMAGE_PNG,
  ASSET_TYPES.IMAGE_WEBP,
]);

// The assets that we allow the users to upload
export const SUPPORTED_UPLOAD_ASSET_TYPES: Set<string> = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  ASSET_TYPES.TEXT_HTML,
  ASSET_TYPES.APPLICATION_PDF,
  ASSET_TYPES.APPLICATION_WARC,
]);

// The assets that we allow as a bookmark of type asset
export const SUPPORTED_BOOKMARK_ASSET_TYPES: Set<string> = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  ASSET_TYPES.APPLICATION_PDF,
  ASSET_TYPES.APPLICATION_WARC,
]);

// The assets that we support saving in the asset db
export const SUPPORTED_ASSET_TYPES: Set<string> = new Set<string>([
  ...SUPPORTED_UPLOAD_ASSET_TYPES,
  ASSET_TYPES.TEXT_HTML,
  ASSET_TYPES.VIDEO_MP4,
]);

function getAssetDir(userId: string, assetId: string) {
  return path.join(ROOT_PATH, userId, assetId);
}

export const zAssetMetadataSchema = z.object({
  contentType: z.string(),
  fileName: z.string().nullish(),
});

export function newAssetId() {
  return crypto.randomUUID();
}

export async function saveAsset({
  userId,
  assetId,
  asset,
  metadata,
}: {
  userId: string;
  assetId: string;
  asset: Buffer;
  metadata: z.infer<typeof zAssetMetadataSchema>;
}) {
  if (!SUPPORTED_ASSET_TYPES.has(metadata.contentType)) {
    throw new Error("Unsupported asset type");
  }
  const assetDir = getAssetDir(userId, assetId);
  await fs.promises.mkdir(assetDir, { recursive: true });

  await Promise.all([
    fs.promises.writeFile(
      path.join(assetDir, "asset.bin"),
      Uint8Array.from(asset),
    ),
    fs.promises.writeFile(
      path.join(assetDir, "metadata.json"),
      JSON.stringify(metadata),
    ),
  ]);
}

export async function saveAssetFromFile({
  userId,
  assetId,
  assetPath,
  metadata,
}: {
  userId: string;
  assetId: string;
  assetPath: string;
  metadata: z.infer<typeof zAssetMetadataSchema>;
}) {
  if (!SUPPORTED_ASSET_TYPES.has(metadata.contentType)) {
    throw new Error("Unsupported asset type");
  }
  const assetDir = getAssetDir(userId, assetId);
  await fs.promises.mkdir(assetDir, { recursive: true });

  await Promise.all([
    // We'll have to copy first then delete the original file as inside the docker container
    // we can't move file between mounts.
    fs.promises.copyFile(assetPath, path.join(assetDir, "asset.bin")),
    fs.promises.writeFile(
      path.join(assetDir, "metadata.json"),
      JSON.stringify(metadata),
    ),
  ]);
  await fs.promises.rm(assetPath);
}

export async function readAsset({
  userId,
  assetId,
}: {
  userId: string;
  assetId: string;
}) {
  const assetDir = getAssetDir(userId, assetId);

  const [asset, metadataStr] = await Promise.all([
    fs.promises.readFile(path.join(assetDir, "asset.bin")),
    fs.promises.readFile(path.join(assetDir, "metadata.json"), {
      encoding: "utf8",
    }),
  ]);

  const metadata = zAssetMetadataSchema.parse(JSON.parse(metadataStr));
  return { asset, metadata };
}

export function createAssetReadStream({
  userId,
  assetId,
  start,
  end,
}: {
  userId: string;
  assetId: string;
  start?: number;
  end?: number;
}) {
  const assetDir = getAssetDir(userId, assetId);

  return fs.createReadStream(path.join(assetDir, "asset.bin"), {
    start,
    end,
  });
}

export async function readAssetMetadata({
  userId,
  assetId,
}: {
  userId: string;
  assetId: string;
}) {
  const assetDir = getAssetDir(userId, assetId);

  const metadataStr = await fs.promises.readFile(
    path.join(assetDir, "metadata.json"),
    {
      encoding: "utf8",
    },
  );

  return zAssetMetadataSchema.parse(JSON.parse(metadataStr));
}

export async function getAssetSize({
  userId,
  assetId,
}: {
  userId: string;
  assetId: string;
}) {
  const assetDir = getAssetDir(userId, assetId);
  const stat = await fs.promises.stat(path.join(assetDir, "asset.bin"));
  return stat.size;
}

/**
 * Deletes the passed in asset if it exists and ignores any errors
 * @param userId the id of the user the asset belongs to
 * @param assetId the id of the asset to delete
 */
export async function silentDeleteAsset(
  userId: string,
  assetId: string | undefined,
) {
  if (assetId) {
    await deleteAsset({ userId, assetId }).catch(() => ({}));
  }
}

export async function deleteAsset({
  userId,
  assetId,
}: {
  userId: string;
  assetId: string;
}) {
  const assetDir = getAssetDir(userId, assetId);
  await fs.promises.rm(path.join(assetDir), { recursive: true });
}

export async function deleteUserAssets({ userId }: { userId: string }) {
  const userDir = path.join(ROOT_PATH, userId);
  const dirExists = await fs.promises
    .access(userDir)
    .then(() => true)
    .catch(() => false);
  if (!dirExists) {
    return;
  }
  await fs.promises.rm(userDir, { recursive: true });
}

export async function* getAllAssets() {
  const g = new Glob(`/**/**/asset.bin`, {
    maxDepth: 3,
    root: ROOT_PATH,
    cwd: ROOT_PATH,
    absolute: false,
  });
  for await (const file of g) {
    const [userId, assetId] = file.split("/").slice(0, 2);
    const [size, metadata] = await Promise.all([
      getAssetSize({ userId, assetId }),
      readAssetMetadata({ userId, assetId }),
    ]);
    yield {
      userId,
      assetId,
      ...metadata,
      size,
    };
  }
}

export async function storeScreenshot(
  screenshot: Buffer | undefined,
  userId: string,
  jobId: string,
) {
  if (!serverConfig.crawler.storeScreenshot) {
    logger.info(
      `[Crawler][${jobId}] Skipping storing the screenshot as per the config.`,
    );
    return null;
  }
  if (!screenshot) {
    logger.info(
      `[Crawler][${jobId}] Skipping storing the screenshot as it's empty.`,
    );
    return null;
  }
  const assetId = newAssetId();
  const contentType = "image/png";
  const fileName = "screenshot.png";
  await saveAsset({
    userId,
    assetId,
    metadata: { contentType, fileName },
    asset: screenshot,
  });
  logger.info(
    `[Crawler][${jobId}] Stored the screenshot as assetId: ${assetId}`,
  );
  return { assetId, contentType, fileName, size: screenshot.byteLength };
}
