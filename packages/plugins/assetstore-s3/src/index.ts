import * as fs from "node:fs";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { AssetMetadata, AssetStore } from "@karakeep/shared/assetdb";
import { SUPPORTED_ASSET_TYPES } from "@karakeep/shared/assetdb";
import logger from "@karakeep/shared/logger";

export class S3AssetStore implements AssetStore {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
  ) {}

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

  async readAsset({
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
      start !== undefined || end !== undefined
        ? `bytes=${start ?? 0}-${end ?? ""}`
        : undefined;

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
        Range: range,
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
      start !== undefined || end !== undefined
        ? `bytes=${start ?? 0}-${end ?? ""}`
        : undefined;

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: this.getAssetKey(userId, assetId),
        Range: range,
      }),
    );
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
              Objects: listResponse.Contents.map((object) => ({
                Key: object.Key!,
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
        for (const object of listResponse.Contents) {
          if (!object.Key) continue;

          const pathParts = object.Key.split("/");
          if (pathParts.length === 2) {
            const userId = pathParts[0];
            const assetId = pathParts[1];

            try {
              const headResponse = await this.s3Client.send(
                new HeadObjectCommand({
                  Bucket: this.bucketName,
                  Key: object.Key,
                }),
              );

              const metadata = this.s3MetadataToMetadata(headResponse.Metadata);
              const size = headResponse.ContentLength || 0;

              yield { userId, assetId, ...metadata, size };
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
