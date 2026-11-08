import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ASSET_TYPES,
  SUPPORTED_UPLOAD_ASSET_TYPES,
} from "@karakeep/shared/assetdb";

import { FileSystemAssetStoreProvider } from "../../index";
import { LocalFileSystemAssetStore } from "../index";

describe("FileSystemAssetStoreProvider", () => {
  it("persists internal summary text without allowing plain-text uploads", async () => {
    const root = await mkdtemp(join(tmpdir(), "karakeep-summary-source-"));
    try {
      const store = new LocalFileSystemAssetStore(root);
      const asset = Buffer.from("Полный транскрипт источника для саммари");
      const metadata = {
        contentType: ASSET_TYPES.TEXT_PLAIN,
        fileName: "summary-source.txt",
      };
      await store.saveAsset({
        userId: "owner",
        assetId: "transcript",
        asset,
        metadata,
      });
      expect(
        await store.readAsset({ userId: "owner", assetId: "transcript" }),
      ).toEqual({ asset, metadata });
      expect(SUPPORTED_UPLOAD_ASSET_TYPES.has(ASSET_TYPES.TEXT_PLAIN)).toBe(
        false,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns one client across concurrent calls", async () => {
    const provider = new FileSystemAssetStoreProvider();

    const [first, second] = await Promise.all([
      provider.getClient(),
      provider.getClient(),
    ]);

    expect(first).toBe(second);
  });
});
