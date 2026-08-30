import * as fs from "node:fs";
import * as path from "node:path";
import { Glob } from "glob";

import type { AssetMetadata, AssetStore } from "@karakeep/shared/assetdb";
import {
  SUPPORTED_ASSET_TYPES,
  zAssetMetadataSchema,
} from "@karakeep/shared/assetdb";

export class LocalFileSystemAssetStore implements AssetStore {
  constructor(private readonly rootPath: string) {}

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
    const assetDir = this.getAssetDir(userId, assetId);

    const readAssetFile =
      start !== undefined || end !== undefined
        ? (async () => {
            const fd = await fs.promises.open(
              path.join(assetDir, "asset.bin"),
              "r",
            );
            try {
              const stat = await fd.stat();
              const offset = start ?? 0;
              const effectiveEnd = Math.min(
                end !== undefined ? end + 1 : stat.size,
                stat.size,
              );
              const length = effectiveEnd - offset;
              const buffer = Buffer.alloc(length);
              const { bytesRead } = await fd.read(buffer, 0, length, offset);
              return bytesRead < length
                ? buffer.subarray(0, bytesRead)
                : buffer;
            } finally {
              await fd.close();
            }
          })()
        : fs.promises.readFile(path.join(assetDir, "asset.bin"));

    const [asset, metadataStr] = await Promise.all([
      readAssetFile,
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

    return fs.createReadStream(assetPath, { start, end });
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
      { encoding: "utf8" },
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
    if (!(await this.isPathExists(userDir))) {
      return;
    }
    await fs.promises.rm(userDir, { recursive: true });
  }

  async *getAllAssets() {
    const assets = new Glob("/**/**/asset.bin", {
      maxDepth: 3,
      root: this.rootPath,
      cwd: this.rootPath,
      absolute: false,
    });
    for await (const file of assets) {
      const [userId, assetId] = file.split("/").slice(0, 2);
      const [size, metadata] = await Promise.all([
        this.getAssetSize({ userId, assetId }),
        this.readAssetMetadata({ userId, assetId }),
      ]);
      yield { userId, assetId, ...metadata, size };
    }
  }
}
