import * as fs from "fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ASSET_TYPES, AssetStore } from "@karakeep/shared-server/assetdb";

import {
  assertAssetExists,
  assertAssetNotExists,
  cleanupTempDirectory,
  cleanupTestBucket,
  createLocalFileSystemStore,
  createS3Store,
  createTempDirectory,
  createTempFile,
  createTestAssetData,
  createTestBucket,
  createTestImageData,
  createTestPdfData,
  generateLargeBuffer,
  getAllAssetsArray,
  streamToBuffer,
} from "./assetdb-utils";

interface TestContext {
  store: AssetStore;
  cleanup: () => Promise<void>;
}

async function createLocalContext(): Promise<TestContext> {
  const tempDir = await createTempDirectory();
  const store = createLocalFileSystemStore(tempDir);

  return {
    store,
    cleanup: async () => {
      await cleanupTempDirectory(tempDir);
    },
  };
}

async function createS3Context(): Promise<TestContext> {
  const bucketName = `test-bucket-${Math.random().toString(36).substring(7)}`;
  const s3Client = await createTestBucket(bucketName);
  const store = createS3Store(bucketName);

  return {
    store,
    cleanup: async () => {
      await cleanupTestBucket(s3Client, bucketName);
    },
  };
}

describe.each([
  { name: "LocalFileSystemAssetStore", createContext: createLocalContext },
  { name: "S3AssetStore", createContext: createS3Context },
])("AssetStore Interface Compliance - $name", ({ createContext }) => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createContext();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe("Basic CRUD Operations", () => {
    it("should save and retrieve an asset", async () => {
      const testData = createTestAssetData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { asset, metadata } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(asset).toEqual(testData.content);
      expect(metadata).toEqual(testData.metadata);
    });

    it("should delete an asset", async () => {
      const testData = createTestAssetData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      await assertAssetExists(context.store, testData.userId, testData.assetId);

      await context.store.deleteAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      await assertAssetNotExists(
        context.store,
        testData.userId,
        testData.assetId,
      );
    });

    it("should get asset size", async () => {
      const testData = createTestAssetData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const size = await context.store.getAssetSize({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(size).toBe(testData.content.length);
    });

    it("should read asset metadata", async () => {
      const testData = createTestAssetData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const metadata = await context.store.readAssetMetadata({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(metadata).toEqual(testData.metadata);
    });
  });

  describe("Streaming Operations", () => {
    it("should create readable stream", async () => {
      const testData = createTestAssetData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const stream = await context.store.createAssetReadStream({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      const streamedContent = await streamToBuffer(stream);
      expect(streamedContent).toEqual(testData.content);
    });

    it("should support range requests in streams", async () => {
      const content = Buffer.from("0123456789abcdef");
      const testData = createTestAssetData({ content });

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const stream = await context.store.createAssetReadStream({
        userId: testData.userId,
        assetId: testData.assetId,
        start: 5,
        end: 10,
      });

      const streamedContent = await streamToBuffer(stream);
      expect(streamedContent.toString()).toBe("56789a");
    });
  });

  describe("Asset Types Support", () => {
    it("should support all required asset types", async () => {
      const testCases = [
        { contentType: ASSET_TYPES.IMAGE_JPEG, fileName: "test.jpg" },
        { contentType: ASSET_TYPES.IMAGE_PNG, fileName: "test.png" },
        { contentType: ASSET_TYPES.IMAGE_WEBP, fileName: "test.webp" },
        { contentType: ASSET_TYPES.APPLICATION_PDF, fileName: "test.pdf" },
        { contentType: ASSET_TYPES.TEXT_HTML, fileName: "test.html" },
        { contentType: ASSET_TYPES.VIDEO_MP4, fileName: "test.mp4" },
      ];

      for (const { contentType, fileName } of testCases) {
        const testData = createTestAssetData({
          metadata: { contentType, fileName },
        });

        await context.store.saveAsset({
          userId: testData.userId,
          assetId: testData.assetId,
          asset: testData.content,
          metadata: testData.metadata,
        });

        const { metadata } = await context.store.readAsset({
          userId: testData.userId,
          assetId: testData.assetId,
        });

        expect(metadata.contentType).toBe(contentType);
        expect(metadata.fileName).toBe(fileName);
      }
    });

    it("should handle large assets", async () => {
      const largeContent = generateLargeBuffer(5); // 5MB
      const testData = createTestAssetData({ content: largeContent });

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { asset } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(asset.length).toBe(largeContent.length);
      expect(asset).toEqual(largeContent);
    });

    it("should reject unsupported asset types", async () => {
      const testData = createTestAssetData({
        metadata: {
          contentType: "unsupported/type",
          fileName: "test.unsupported",
        },
      });

      await expect(
        context.store.saveAsset({
          userId: testData.userId,
          assetId: testData.assetId,
          asset: testData.content,
          metadata: testData.metadata,
        }),
      ).rejects.toThrow("Unsupported asset type");
    });
  });

  describe("Bulk Operations", () => {
    it("should delete all user assets", async () => {
      const userId = "bulk-test-user";
      const testAssets = [
        createTestAssetData({ userId }),
        createTestAssetData({ userId }),
        createTestAssetData({ userId }),
      ];
      const otherUserAsset = createTestAssetData(); // Different user

      // Save all assets
      await Promise.all([
        ...testAssets.map((testData) =>
          context.store.saveAsset({
            userId: testData.userId,
            assetId: testData.assetId,
            asset: testData.content,
            metadata: testData.metadata,
          }),
        ),
        context.store.saveAsset({
          userId: otherUserAsset.userId,
          assetId: otherUserAsset.assetId,
          asset: otherUserAsset.content,
          metadata: otherUserAsset.metadata,
        }),
      ]);

      // Delete user assets
      await context.store.deleteUserAssets({ userId });

      // Verify user assets are deleted
      for (const testData of testAssets) {
        await assertAssetNotExists(
          context.store,
          testData.userId,
          testData.assetId,
        );
      }

      // Verify other user's asset still exists
      await assertAssetExists(
        context.store,
        otherUserAsset.userId,
        otherUserAsset.assetId,
      );
    });

    it("should list all assets", async () => {
      const testAssets = [
        createTestAssetData(),
        createTestImageData(),
        createTestPdfData(),
      ];

      // Save all assets
      await Promise.all(
        testAssets.map((testData) =>
          context.store.saveAsset({
            userId: testData.userId,
            assetId: testData.assetId,
            asset: testData.content,
            metadata: testData.metadata,
          }),
        ),
      );

      const assets = await getAllAssetsArray(context.store);

      expect(assets).toHaveLength(3);

      // Verify all assets are present
      const assetIds = assets.map((a) => a.assetId);
      for (const testData of testAssets) {
        expect(assetIds).toContain(testData.assetId);
      }

      // Verify asset structure
      for (const asset of assets) {
        expect(asset).toHaveProperty("userId");
        expect(asset).toHaveProperty("assetId");
        expect(asset).toHaveProperty("contentType");
        expect(asset).toHaveProperty("size");
        expect(typeof asset.size).toBe("number");
        expect(asset.size).toBeGreaterThan(0);
      }
    });
  });

  describe("File Operations", () => {
    it("should save asset from file and delete original file", async () => {
      const testData = createTestAssetData();
      const tempFile = await createTempFile(testData.content, "temp-asset.bin");

      // Verify temp file exists before operation
      expect(
        await fs.promises
          .access(tempFile)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      await context.store.saveAssetFromFile({
        userId: testData.userId,
        assetId: testData.assetId,
        assetPath: tempFile,
        metadata: testData.metadata,
      });

      // Verify temp file was deleted
      expect(
        await fs.promises
          .access(tempFile)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);

      // Verify asset was saved correctly
      const { asset, metadata } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(asset).toEqual(testData.content);
      expect(metadata).toEqual(testData.metadata);
    });
  });

  describe("Error Handling", () => {
    it("should throw error for non-existent asset read", async () => {
      await expect(
        context.store.readAsset({
          userId: "non-existent-user",
          assetId: "non-existent-asset",
        }),
      ).rejects.toThrow();
    });

    it("should throw error for non-existent asset metadata", async () => {
      await expect(
        context.store.readAssetMetadata({
          userId: "non-existent-user",
          assetId: "non-existent-asset",
        }),
      ).rejects.toThrow();
    });

    it("should throw error for non-existent asset size", async () => {
      await expect(
        context.store.getAssetSize({
          userId: "non-existent-user",
          assetId: "non-existent-asset",
        }),
      ).rejects.toThrow();
    });

    it("should handle deleting non-existent asset gracefully", async () => {
      // Filesystem implementation throws errors for non-existent files
      await expect(
        context.store.deleteAsset({
          userId: "non-existent-user",
          assetId: "non-existent-asset",
        }),
      ).resolves.not.toThrow();
    });

    it("should handle deletion of non-existent user directory gracefully", async () => {
      // Should not throw error when user directory doesn't exist
      await expect(
        context.store.deleteUserAssets({ userId: "non-existent-user" }),
      ).resolves.not.toThrow();
    });

    it("should handle non-existent asset stream appropriately", async () => {
      const streamResult = context.store.createAssetReadStream({
        userId: "non-existent-user",
        assetId: "non-existent-asset",
      });

      await expect(streamResult).rejects.toThrow();
    });
  });

  describe("Data Integrity", () => {
    it("should preserve binary data integrity", async () => {
      const testData = createTestImageData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { asset } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      // Verify exact binary match
      expect(asset).toEqual(testData.content);

      // Verify PNG header is intact
      expect(asset[0]).toBe(0x89);
      expect(asset[1]).toBe(0x50);
      expect(asset[2]).toBe(0x4e);
      expect(asset[3]).toBe(0x47);
    });

    it("should preserve metadata exactly", async () => {
      const testData = createTestAssetData({
        metadata: {
          contentType: ASSET_TYPES.APPLICATION_PDF,
          fileName: "test-document.pdf",
        },
      });

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { metadata } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(metadata).toEqual(testData.metadata);
      expect(metadata.contentType).toBe(ASSET_TYPES.APPLICATION_PDF);
      expect(metadata.fileName).toBe("test-document.pdf");
    });

    it("should handle null fileName correctly", async () => {
      const testData = createTestAssetData({
        metadata: {
          contentType: ASSET_TYPES.TEXT_HTML,
          fileName: null,
        },
      });

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { metadata } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(metadata.fileName).toBeNull();
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent saves safely", async () => {
      const testAssets = Array.from({ length: 5 }, () => createTestAssetData());

      await Promise.all(
        testAssets.map((testData) =>
          context.store.saveAsset({
            userId: testData.userId,
            assetId: testData.assetId,
            asset: testData.content,
            metadata: testData.metadata,
          }),
        ),
      );

      // Verify all assets were saved correctly
      for (const testData of testAssets) {
        const { asset, metadata } = await context.store.readAsset({
          userId: testData.userId,
          assetId: testData.assetId,
        });

        expect(asset).toEqual(testData.content);
        expect(metadata).toEqual(testData.metadata);
      }
    });

    it("should handle concurrent reads safely", async () => {
      const testData = createTestAssetData();

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      // Perform multiple concurrent reads
      const readPromises = Array.from({ length: 10 }, () =>
        context.store.readAsset({
          userId: testData.userId,
          assetId: testData.assetId,
        }),
      );

      const results = await Promise.all(readPromises);

      // Verify all reads returned the same data
      for (const { asset, metadata } of results) {
        expect(asset).toEqual(testData.content);
        expect(metadata).toEqual(testData.metadata);
      }
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty assets", async () => {
      const testData = createTestAssetData({
        content: Buffer.alloc(0),
      });

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { asset } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(asset.length).toBe(0);

      const size = await context.store.getAssetSize({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(size).toBe(0);
    });

    it("should handle special characters in user and asset IDs", async () => {
      const testData = createTestAssetData({
        userId: "user-with-special_chars.123",
        assetId: "asset_with-special.chars_456",
      });

      await context.store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const { asset, metadata } = await context.store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(asset).toEqual(testData.content);
      expect(metadata).toEqual(testData.metadata);
    });
  });
});
