import * as fs from "fs";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalFileSystemAssetStore } from "@karakeep/shared/assetdb";

import {
  assertAssetNotExists,
  cleanupTempDirectory,
  createLocalFileSystemStore,
  createTempDirectory,
  createTestAssetData,
} from "./assetdb-utils";

describe("LocalFileSystemAssetStore - Filesystem-Specific Behaviors", () => {
  let tempDir: string;
  let store: LocalFileSystemAssetStore;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    store = createLocalFileSystemStore(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDirectory(tempDir);
  });

  describe("File System Structure", () => {
    it("should create correct directory structure and files", async () => {
      const testData = createTestAssetData();

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      // Verify directory structure
      const assetDir = path.join(tempDir, testData.userId, testData.assetId);
      expect(
        await fs.promises
          .access(assetDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      // Verify asset.bin file
      const assetFile = path.join(assetDir, "asset.bin");
      expect(
        await fs.promises
          .access(assetFile)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      // Verify metadata.json file
      const metadataFile = path.join(assetDir, "metadata.json");
      expect(
        await fs.promises
          .access(metadataFile)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      // Verify file contents
      const savedContent = await fs.promises.readFile(assetFile);
      expect(savedContent).toEqual(testData.content);

      const savedMetadata = JSON.parse(
        await fs.promises.readFile(metadataFile, "utf8"),
      );
      expect(savedMetadata).toEqual(testData.metadata);
    });

    it("should create nested directory structure for user/asset hierarchy", async () => {
      const userId = "user123";
      const assetId = "asset456";
      const testData = createTestAssetData({ userId, assetId });

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      // Verify the exact directory structure
      const userDir = path.join(tempDir, userId);
      const assetDir = path.join(userDir, assetId);

      expect(
        await fs.promises
          .access(userDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      expect(
        await fs.promises
          .access(assetDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      // Verify files exist in the correct location
      expect(
        await fs.promises
          .access(path.join(assetDir, "asset.bin"))
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      expect(
        await fs.promises
          .access(path.join(assetDir, "metadata.json"))
          .then(() => true)
          .catch(() => false),
      ).toBe(true);
    });
  });

  describe("Directory Cleanup", () => {
    it("should remove entire asset directory when deleting asset", async () => {
      const testData = createTestAssetData();

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const assetDir = path.join(tempDir, testData.userId, testData.assetId);

      // Verify directory exists
      expect(
        await fs.promises
          .access(assetDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      await store.deleteAsset({
        userId: testData.userId,
        assetId: testData.assetId,
      });

      // Verify entire directory was removed
      expect(
        await fs.promises
          .access(assetDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);

      await assertAssetNotExists(store, testData.userId, testData.assetId);
    });

    it("should remove entire user directory when deleting all user assets", async () => {
      const userId = "test-user";
      const testData1 = createTestAssetData({ userId });
      const testData2 = createTestAssetData({ userId });

      await Promise.all([
        store.saveAsset({
          userId: testData1.userId,
          assetId: testData1.assetId,
          asset: testData1.content,
          metadata: testData1.metadata,
        }),
        store.saveAsset({
          userId: testData2.userId,
          assetId: testData2.assetId,
          asset: testData2.content,
          metadata: testData2.metadata,
        }),
      ]);

      const userDir = path.join(tempDir, userId);

      // Verify user directory exists
      expect(
        await fs.promises
          .access(userDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);

      await store.deleteUserAssets({ userId });

      // Verify entire user directory was removed
      expect(
        await fs.promises
          .access(userDir)
          .then(() => true)
          .catch(() => false),
      ).toBe(false);
    });
  });

  describe("File System Permissions", () => {
    it("should create directories with appropriate permissions", async () => {
      const testData = createTestAssetData();

      await store.saveAsset({
        userId: testData.userId,
        assetId: testData.assetId,
        asset: testData.content,
        metadata: testData.metadata,
      });

      const userDir = path.join(tempDir, testData.userId);
      const assetDir = path.join(userDir, testData.assetId);

      // Verify directories are readable and writable
      const userStats = await fs.promises.stat(userDir);
      const assetStats = await fs.promises.stat(assetDir);

      expect(userStats.isDirectory()).toBe(true);
      expect(assetStats.isDirectory()).toBe(true);

      // Verify we can read and write to the directories
      await fs.promises.access(userDir, fs.constants.R_OK | fs.constants.W_OK);
      await fs.promises.access(assetDir, fs.constants.R_OK | fs.constants.W_OK);
    });
  });
});
