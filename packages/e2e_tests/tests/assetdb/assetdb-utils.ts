import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  ASSET_TYPES,
  AssetMetadata,
  AssetStore,
  LocalFileSystemAssetStore,
  S3AssetStore,
} from "@karakeep/shared-server/assetdb";

export interface TestAssetData {
  userId: string;
  assetId: string;
  content: Buffer;
  metadata: AssetMetadata;
}

export function createTestAssetData(
  overrides: Partial<TestAssetData> = {},
): TestAssetData {
  const defaultData: TestAssetData = {
    userId: `user_${Math.random().toString(36).substring(7)}`,
    assetId: `asset_${Math.random().toString(36).substring(7)}`,
    content: Buffer.from(`Test content ${Math.random()}`),
    metadata: {
      contentType: ASSET_TYPES.TEXT_HTML,
      fileName: "test.html",
    },
  };

  return { ...defaultData, ...overrides };
}

export function createTestImageData(): TestAssetData {
  // Create a minimal PNG image (1x1 pixel)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0x0f, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x5c, 0xc2, 0x8a, 0x8e, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  return createTestAssetData({
    content: pngData,
    metadata: {
      contentType: ASSET_TYPES.IMAGE_PNG,
      fileName: "test.png",
    },
  });
}

export function createTestPdfData(): TestAssetData {
  // Create a minimal PDF
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
>>
endobj

xref
0 4
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000125 00000 n 
trailer
<<
/Size 4
/Root 1 0 R
>>
startxref
173
%%EOF`;

  return createTestAssetData({
    content: Buffer.from(pdfContent),
    metadata: {
      contentType: ASSET_TYPES.APPLICATION_PDF,
      fileName: "test.pdf",
    },
  });
}

export async function createTempDirectory(): Promise<string> {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "assetdb-test-"),
  );
  return tempDir;
}

export async function cleanupTempDirectory(tempDir: string): Promise<void> {
  try {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Failed to cleanup temp directory ${tempDir}:`, error);
  }
}

export function createLocalFileSystemStore(
  rootPath: string,
): LocalFileSystemAssetStore {
  return new LocalFileSystemAssetStore(rootPath);
}

export function createS3Store(bucketName: string): S3AssetStore {
  const s3Client = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:9000", // MinIO endpoint for testing
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
    forcePathStyle: true,
  });

  return new S3AssetStore(s3Client, bucketName);
}

export async function createTestBucket(bucketName: string): Promise<S3Client> {
  const s3Client = new S3Client({
    region: "us-east-1",
    endpoint: "http://localhost:9000",
    credentials: {
      accessKeyId: "minioadmin",
      secretAccessKey: "minioadmin",
    },
    forcePathStyle: true,
  });

  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (
      err.name !== "BucketAlreadyOwnedByYou" &&
      err.name !== "BucketAlreadyExists"
    ) {
      throw error;
    }
  }

  return s3Client;
}

export async function cleanupTestBucket(
  s3Client: S3Client,
  bucketName: string,
): Promise<void> {
  try {
    // List and delete all objects
    let continuationToken: string | undefined;
    do {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        }),
      );

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const deletePromises = listResponse.Contents.map(
          (obj: { Key?: string }) =>
            s3Client.send(
              new DeleteObjectCommand({
                Bucket: bucketName,
                Key: obj.Key!,
              }),
            ),
        );
        await Promise.all(deletePromises);
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    // Delete the bucket
    await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
  } catch (error) {
    console.warn(`Failed to cleanup S3 bucket ${bucketName}:`, error);
  }
}

export async function createTempFile(
  content: Buffer,
  fileName: string,
): Promise<string> {
  const tempDir = await createTempDirectory();
  const filePath = path.join(tempDir, fileName);
  await fs.promises.writeFile(filePath, content);
  return filePath;
}

export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const readable = stream as AsyncIterable<Buffer>;

  for await (const chunk of readable) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export function generateLargeBuffer(sizeInMB: number): Buffer {
  const sizeInBytes = sizeInMB * 1024 * 1024;
  const buffer = Buffer.alloc(sizeInBytes);

  // Fill with some pattern to make it compressible but not empty
  for (let i = 0; i < sizeInBytes; i++) {
    buffer[i] = i % 256;
  }

  return buffer;
}

export async function assertAssetExists(
  store: AssetStore,
  userId: string,
  assetId: string,
): Promise<void> {
  const { asset, metadata } = await store.readAsset({ userId, assetId });
  if (!asset || !metadata) {
    throw new Error(`Asset ${assetId} for user ${userId} does not exist`);
  }
}

export async function assertAssetNotExists(
  store: AssetStore,
  userId: string,
  assetId: string,
): Promise<void> {
  try {
    await store.readAsset({ userId, assetId });
    throw new Error(`Asset ${assetId} for user ${userId} should not exist`);
  } catch (error: unknown) {
    // Expected to throw
    const err = error as { message?: string };
    if (err.message?.includes("should not exist")) {
      throw error;
    }
  }
}

export async function getAllAssetsArray(store: AssetStore): Promise<
  {
    userId: string;
    assetId: string;
    contentType: string;
    fileName?: string | null;
    size: number;
  }[]
> {
  const assets = [];
  for await (const asset of store.getAllAssets()) {
    assets.push(asset);
  }
  return assets;
}
