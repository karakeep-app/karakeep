import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { S3AssetStore } from "@karakeep/shared-server/assetdb";

import {
  assertAssetExists,
  cleanupTestBucket,
  createS3Store,
  createTestAssetData,
  createTestBucket,
} from "./assetdb-utils";

describe("S3AssetStore - S3-Specific Behaviors", () => {
  let bucketName: string;
  let s3Client: S3Client;
  let store: S3AssetStore;

  beforeEach(async () => {
    bucketName = `test-bucket-${Math.random().toString(36).substring(7)}`;
    s3Client = await createTestBucket(bucketName);
    store = createS3Store(bucketName);
  });

  afterEach(async () => {
    await cleanupTestBucket(s3Client, bucketName);
  });

  describe("S3 Object Structure", () => {
    it("should store asset as single object with user-defined metadata", async () => {
      const testData = createTestAssetData();

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      // Verify the object exists with the expected key structure
      const objectKey = `${testData.userId}/${testData.assetId}`;
      const headResponse = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        }),
      );

      // Verify metadata is stored in S3 user-defined metadata
      expect(headResponse.Metadata).toBeDefined();
      expect(headResponse.Metadata!["x-amz-meta-content-type"]).toBe(
        testData.metadata.contentType,
      );
      expect(headResponse.Metadata!["x-amz-meta-file-name"]).toBe(
        testData.metadata.fileName || "",
      );

      // Verify content type is set correctly on the S3 object
      expect(headResponse.ContentType).toBe(testData.metadata.contentType);
    });

    it("should handle null fileName in metadata correctly", async () => {
      const testData = createTestAssetData({
        metadata: {
          contentType: "text/html",
          fileName: null,
        },
      });

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const objectKey = `${testData.userId}/${testData.assetId}`;
      const headResponse = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
        }),
      );

      // Verify null fileName are not stored in S3 metadata
      expect(headResponse.Metadata!["x-amz-meta-file-name"]).toBeUndefined();

      // Verify reading back gives us null fileName
      const metadata = await store.readAssetMetadata({
        userId: testData.userId,
        assetId: testData.assetId,
      });
      expect(metadata.fileName).toBeNull();
    });
  });

  describe("S3 Key Structure", () => {
    it("should use clean userId/assetId key structure", async () => {
      const userId = "user123";
      const assetId = "asset456";
      const testData = createTestAssetData({ userId, assetId });

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      // Verify the exact key structure
      const expectedKey = `${userId}/${assetId}`;
      const headResponse = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucketName,
          Key: expectedKey,
        }),
      );

      expect(headResponse.ContentLength).toBe(testData.content.length);
    });

    it("should handle special characters in user and asset IDs", async () => {
      const userId = "user/with/slashes";
      const assetId = "asset-with-special-chars_123";
      const testData = createTestAssetData({ userId, assetId });

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      await assertAssetExists(store, testData.userId, testData.assetId);
    });
  });

  describe("S3 Eventual Consistency", () => {
    it("should handle immediate read after write (MinIO strong consistency)", async () => {
      const testData = createTestAssetData();

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      // Immediately try to read - should work with MinIO's strong consistency
      const { asset, metadata } = await store.readAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      expect(asset).toEqual(testData.content);
      expect(metadata).toEqual(testData.metadata);
    });
  });

  describe("S3 Metadata Conversion", () => {
    it("should correctly convert between AssetMetadata and S3 metadata", async () => {
      const testCases = [
        {
          contentType: "image/jpeg",
          fileName: "test-image.jpg",
        },
        {
          contentType: "application/pdf",
          fileName: "document.pdf",
        },
        {
          contentType: "text/html",
          fileName: null,
        },
      ];

      for (const metadata of testCases) {
        const testData = createTestAssetData({ metadata });

        await store.saveAsset({
          userId: testData.userId,
          assetId: testData.assetId,
          asset: testData.content,
          metadata: testData.metadata,
        });

        // Verify metadata round-trip
        const retrievedMetadata = await store.readAssetMetadata({
          userId: testData.userId,
          assetId: testData.assetId,
        });

        expect(retrievedMetadata).toEqual(testData.metadata);
      }
    });
  });
});
