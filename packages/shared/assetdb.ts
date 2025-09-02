import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import {
  _Object,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Glob } from "glob";
import { z } from "zod";

import serverConfig from "./config";
import logger from "./logger";
import { QuotaApproved } from "./storageQuota";

const ROOT_PATH = serverConfig.assetsDir;

export const enum ASSET_TYPES {
  IMAGE_JPEG = "image/jpeg",
  IMAGE_PNG = "image/png",
  IMAGE_WEBP = "image/webp",
  APPLICATION_PDF = "application/pdf",
  TEXT_HTML = "text/html",

  VIDEO_MP4 = "video/mp4",
  VIDEO_WEBM = "video/webm",
  VIDEO_MKV = "video/x-matroska",
}

export const VIDEO_ASSET_TYPES: Set<string> = new Set<string>([
  ASSET_TYPES.VIDEO_MP4,
  ASSET_TYPES.VIDEO_WEBM,
  ASSET_TYPES.VIDEO_MKV,
]);

export const IMAGE_ASSET_TYPES: Set<string> = new Set<string>([
  ASSET_TYPES.IMAGE_JPEG,
  ASSET_TYPES.IMAGE_PNG,
  ASSET_TYPES.IMAGE_WEBP,
]);

// The assets that we allow the users to upload
export const SUPPORTED_UPLOAD_ASSET_TYPES: Set<string> = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  ...VIDEO_ASSET_TYPES,
  ASSET_TYPES.TEXT_HTML,
  ASSET_TYPES.APPLICATION_PDF,
]);

// The assets that we allow as a bookmark of type asset
export const SUPPORTED_BOOKMARK_ASSET_TYPES: Set<string> = new Set<string>([
  ...IMAGE_ASSET_TYPES,
  ASSET_TYPES.APPLICATION_PDF,
]);

// The assets that we support saving in the asset db
export const SUPPORTED_ASSET_TYPES: Set<string> = new Set<string>([
  ...SUPPORTED_UPLOAD_ASSET_TYPES,
  ASSET_TYPES.TEXT_HTML,
  ASSET_TYPES.VIDEO_MP4,
]);

export const zAssetMetadataSchema = z.object({
  contentType: z.string(),
  fileName: z.string().nullish(),
});

export type AssetMetadata = z.infer<typeof zAssetMetadataSchema>;

export interface AssetInfo {
  userId: string;
  assetId: string;
  contentType: string;
  fileName?: string | null;
  size: number;
}

export interface AssetStore {
  saveAsset(params: {
    userId: string;
    assetId: string;
    asset: Buffer;
    metadata: AssetMetadata;
  }): Promise<void>;

  saveAssetFromFile(params: {
    userId: string;
    assetId: string;
    assetPath: string;
    metadata: AssetMetadata;
  }): Promise<void>;

  readAsset(params: {
    userId: string;
    assetId: string;
  }): Promise<{ asset: Buffer; metadata: AssetMetadata }>;

  createAssetReadStream(params: {
    userId: string;
    assetId: string;
    start?: number;
    end?: number;
  }): Promise<NodeJS.ReadableStream>;

  readAssetMetadata(params: {
    userId: string;
    assetId: string;
  }): Promise<AssetMetadata>;

  getAssetSize(params: { userId: string; assetId: string }): Promise<number>;

  deleteAsset(params: { userId: string; assetId: string }): Promise<void>;

  deleteUserAssets(params: { userId: string }): Promise<void>;

  getAllAssets(): AsyncGenerator<AssetInfo>;
}

export function newAssetId() {
  return crypto.randomUUID();
}

class LocalFileSystemAssetStore implements AssetStore {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  private getAssetDir(userId: string, assetId: string) {
    return path.join(this.rootPath, userId, assetId);
  }

  private async isPathExists(filePath: string) {
    return fs.promises
      .access(filePath)
      .then(() => true)
      .catch(() => false);
  }

  async saveAsset({
    userId,
    assetId,
    asset,
    metadata,
  }: {
    userId: string;
    assetId: string;
    asset: Buffer;
    metadata: AssetMetadata;
  }) {
    if (!SUPPORTED_ASSET_TYPES.has(metadata.contentType)) {
      throw new Error("Unsupported asset type");
    }
    const assetDir = this.getAssetDir(userId, assetId);
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

  async saveAssetFromFile({
    userId,
    assetId,
    assetPath,
    metadata,
  }: {
    userId: string;
    assetId: string;
    assetPath: string;
    metadata: AssetMetadata;
  }) {
    if (!SUPPORTED_ASSET_TYPES.has(metadata.contentType)) {
      throw new Error("Unsupported asset type");
    }
    const assetDir = this.getAssetDir(userId, assetId);
    await fs.promises.mkdir(assetDir, { recursive: true });

    await Promise.all([
      fs.promises.copyFile(assetPath, path.join(assetDir, "asset.bin")),
      fs.promises.writeFile(
        path.join(assetDir, "metadata.json"),
        JSON.stringify(metadata),
      ),
    ]);
    await fs.promises.rm(assetPath);
  }

  async readAsset({ userId, assetId }: { userId: string; assetId: string }) {
    const assetDir = this.getAssetDir(userId, assetId);

    const [asset, metadataStr] = await Promise.all([
      fs.promises.readFile(path.join(assetDir, "asset.bin")),
      fs.promises.readFile(path.join(assetDir, "metadata.json"), {
        encoding: "utf8",
      }),
    ]);

    const metadata = zAssetMetadataSchema.parse(JSON.parse(metadataStr));
    return { asset, metadata };
  }

  async createAssetReadStream({
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
    const assetDir = this.getAssetDir(userId, assetId);
    const assetPath = path.join(assetDir, "asset.bin");
    if (!(await this.isPathExists(assetPath))) {
      throw new Error(`Asset ${assetId} not found`);
    }

    return fs.createReadStream(path.join(assetDir, "asset.bin"), {
      start,
      end,
    });
  }

  async readAssetMetadata({
    userId,
    assetId,
  }: {
    userId: string;
    assetId: string;
  }) {
    const assetDir = this.getAssetDir(userId, assetId);

    const metadataStr = await fs.promises.readFile(
      path.join(assetDir, "metadata.json"),
      {
        encoding: "utf8",
      },
    );

    return zAssetMetadataSchema.parse(JSON.parse(metadataStr));
  }

  async getAssetSize({ userId, assetId }: { userId: string; assetId: string }) {
    const assetDir = this.getAssetDir(userId, assetId);
    const stat = await fs.promises.stat(path.join(assetDir, "asset.bin"));
    return stat.size;
  }

  async deleteAsset({ userId, assetId }: { userId: string; assetId: string }) {
    const assetDir = this.getAssetDir(userId, assetId);
    if (!(await this.isPathExists(assetDir))) {
      return;
    }
    await fs.promises.rm(assetDir, { recursive: true });
  }

  async deleteUserAssets({ userId }: { userId: string }) {
    const userDir = path.join(this.rootPath, userId);
    const dirExists = await this.isPathExists(userDir);
    if (!dirExists) {
      return;
    }
    await fs.promises.rm(userDir, { recursive: true });
  }

  async *getAllAssets() {
    const g = new Glob(`/**/**/asset.bin`, {
      maxDepth: 3,
      root: this.rootPath,
      cwd: this.rootPath,
      absolute: false,
    });
    for await (const file of g) {
      const [userId, assetId] = file.split("/").slice(0, 2);
      const [size, metadata] = await Promise.all([
        this.getAssetSize({ userId, assetId }),
        this.readAssetMetadata({ userId, assetId }),
      ]);
      yield {
        userId,
        assetId,
        ...metadata,
        size,
      };
    }
  }
}

class S3AssetStore implements AssetStore {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(s3Client: S3Client, bucketName: string) {
    this.s3Client = s3Client;
    this.bucketName = bucketName;
  }

  private getAssetKey(userId: string, assetId: string) {
    return `${userId}/${assetId}`;
  }

  private metadataToS3Metadata(
    metadata: AssetMetadata,
  ): Record<string, string> {
    return {
      ...(metadata.fileName
        ? { "x-amz-meta-file-name": metadata.fileName }
        : {}),
      "x-amz-meta-content-type": metadata.contentType,
    };
  }

  private s3MetadataToMetadata(
    s3Metadata: Record<string, string> | undefined,
  ): AssetMetadata {
    if (!s3Metadata) {
      throw new Error("No metadata found in S3 object");
    }

    return {
      contentType: s3Metadata["x-amz-meta-content-type"] || "",
      fileName: s3Metadata["x-amz-meta-file-name"] ?? null,
    };
  }

  async saveAsset({
    userId,
    assetId,
    asset,
    metadata,
  }: {
    userId: string;
    assetId: string;
    asset: Buffer;
    metadata: AssetMetadata;
  }) {
    if (!SUPPORTED_ASSET_TYPES.has(metadata.contentType)) {
      throw new Error("Unsupported asset type");
    }

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
        Body: asset,
        ContentType: metadata.contentType,
        Metadata: this.metadataToS3Metadata(metadata),
      }),
    );
  }

  async saveAssetFromFile({
    userId,
    assetId,
    assetPath,
    metadata,
  }: {
    userId: string;
    assetId: string;
    assetPath: string;
    metadata: AssetMetadata;
  }) {
    if (!SUPPORTED_ASSET_TYPES.has(metadata.contentType)) {
      throw new Error("Unsupported asset type");
    }

    const asset = fs.createReadStream(assetPath);
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
        Body: asset,
        ContentType: metadata.contentType,
        Metadata: this.metadataToS3Metadata(metadata),
      }),
    );
    await fs.promises.rm(assetPath);
  }

  async readAsset({ userId, assetId }: { userId: string; assetId: string }) {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
      }),
    );

    if (!response.Body) {
      throw new Error("Asset not found");
    }

    const assetBuffer = await this.streamToBuffer(response.Body as Readable);
    const metadata = this.s3MetadataToMetadata(response.Metadata);

    return { asset: assetBuffer, metadata };
  }

  async createAssetReadStream({
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
    const range =
      start !== undefined && end !== undefined
        ? `bytes=${start}-${end}`
        : undefined;

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: this.getAssetKey(userId, assetId),
      Range: range,
    });

    const response = await this.s3Client.send(command);
    if (!response.Body) {
      throw new Error("Asset not found");
    }
    return response.Body as NodeJS.ReadableStream;
  }

  async readAssetMetadata({
    userId,
    assetId,
  }: {
    userId: string;
    assetId: string;
  }) {
    const response = await this.s3Client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
      }),
    );

    return this.s3MetadataToMetadata(response.Metadata);
  }

  async getAssetSize({ userId, assetId }: { userId: string; assetId: string }) {
    const response = await this.s3Client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
      }),
    );

    return response.ContentLength || 0;
  }

  async deleteAsset({ userId, assetId }: { userId: string; assetId: string }) {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
      }),
    );
  }

  async deleteUserAssets({ userId }: { userId: string }) {
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: `${userId}/`,
          ContinuationToken: continuationToken,
        }),
      );

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: {
              Objects: listResponse.Contents.map((obj) => ({
                Key: obj.Key!,
              })),
            },
          }),
        );
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }

  async *getAllAssets() {
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          ContinuationToken: continuationToken,
        }),
      );

      if (listResponse.Contents) {
        for (const obj of listResponse.Contents) {
          if (!obj.Key) continue;

          const pathParts = obj.Key.split("/");
          if (pathParts.length === 2) {
            const userId = pathParts[0];
            const assetId = pathParts[1];

            try {
              const headResponse = await this.s3Client.send(
                new HeadObjectCommand({
                  Bucket: this.bucketName,
                  Key: obj.Key,
                }),
              );

              const metadata = this.s3MetadataToMetadata(headResponse.Metadata);
              const size = headResponse.ContentLength || 0;

              yield {
                userId,
                assetId,
                ...metadata,
                size,
              };
            } catch (error) {
              logger.warn(`Failed to read asset ${userId}/${assetId}:`, error);
            }
          }
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

function createDefaultAssetStore(): AssetStore {
  const config = serverConfig.assetStore;

  if (config.type === "s3") {
    if (!config.s3.bucket) {
      throw new Error(
        "ASSET_STORE_S3_BUCKET is required when using S3 asset store",
      );
    }
    if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
      throw new Error(
        "ASSET_STORE_S3_ACCESS_KEY_ID and ASSET_STORE_S3_SECRET_ACCESS_KEY are required when using S3 asset store",
      );
    }

    const s3Client = new S3Client({
      region: config.s3.region,
      endpoint: config.s3.endpoint,
      forcePathStyle: config.s3.forcePathStyle,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    });

    return new S3AssetStore(s3Client, config.s3.bucket);
  }

  return new LocalFileSystemAssetStore(ROOT_PATH);
}

const defaultAssetStore = createDefaultAssetStore();

export { LocalFileSystemAssetStore, S3AssetStore };

/**
 * Example usage of S3AssetStore:
 *
 * import { S3Client } from "@aws-sdk/client-s3";
 * import { S3AssetStore } from "@karakeep/shared/assetdb";
 *
 * const s3Client = new S3Client({
 *   region: "us-east-1",
 *   credentials: {
 *     accessKeyId: "your-access-key",
 *     secretAccessKey: "your-secret-key"
 *   }
 * });
 *
 * const s3AssetStore = new S3AssetStore(s3Client, "your-bucket-name");
 *
 * // Use s3AssetStore instead of the default file system store
 * await s3AssetStore.saveAsset({
 *   userId: "user123",
 *   assetId: "asset456",
 *   asset: buffer,
 *   metadata: { contentType: "image/jpeg", fileName: "photo.jpg" }
 * });
 */

export async function saveAsset({
  userId,
  assetId,
  asset,
  metadata,
  quotaApproved,
}: {
  userId: string;
  assetId: string;
  asset: Buffer;
  metadata: z.infer<typeof zAssetMetadataSchema>;
  quotaApproved: QuotaApproved;
}) {
  // Verify the quota approval is for the correct user and size
  if (quotaApproved.userId !== userId) {
    throw new Error("Quota approval is for a different user");
  }
  if (quotaApproved.approvedSize < asset.byteLength) {
    throw new Error("Asset size exceeds approved quota");
  }

  return defaultAssetStore.saveAsset({ userId, assetId, asset, metadata });
}

export async function saveAssetFromFile({
  userId,
  assetId,
  assetPath,
  metadata,
  quotaApproved,
}: {
  userId: string;
  assetId: string;
  assetPath: string;
  metadata: z.infer<typeof zAssetMetadataSchema>;
  quotaApproved: QuotaApproved;
}) {
  // Verify the quota approval is for the correct user
  if (quotaApproved.userId !== userId) {
    throw new Error("Quota approval is for a different user");
  }

  // For file-based saves, we'll verify the file size matches the approved size
  // when the underlying store implementation reads the file

  return defaultAssetStore.saveAssetFromFile({
    userId,
    assetId,
    assetPath,
    metadata,
  });
}

export async function readAsset({
  userId,
  assetId,
}: {
  userId: string;
  assetId: string;
}) {
  return defaultAssetStore.readAsset({ userId, assetId });
}

export async function createAssetReadStream({
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
  return defaultAssetStore.createAssetReadStream({
    userId,
    assetId,
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
  return defaultAssetStore.readAssetMetadata({ userId, assetId });
}

export async function getAssetSize({
  userId,
  assetId,
}: {
  userId: string;
  assetId: string;
}) {
  return defaultAssetStore.getAssetSize({ userId, assetId });
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
  return defaultAssetStore.deleteAsset({ userId, assetId });
}

export async function deleteUserAssets({ userId }: { userId: string }) {
  return defaultAssetStore.deleteUserAssets({ userId });
}

export async function* getAllAssets() {
  yield* defaultAssetStore.getAllAssets();
}
