import { validateHeaderValue } from "node:http";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";

import { S3AssetStore } from "../index";

describe("S3 generic attachments", () => {
  it("round-trips bytes, download-only flag and unsafe Unicode filenames as ASCII metadata", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const store = new S3AssetStore(client, "test");
    const bytes = Buffer.from([0, 255, 19, 128]);
    const fileName = '../..\\模型 "a"\r\nX-Evil: yes.stl';
    let stored: PutObjectCommand["input"] | undefined;
    vi.spyOn(client, "send").mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand) {
        stored = command.input;
        return {};
      }
      if (command instanceof HeadObjectCommand)
        return { Metadata: stored!.Metadata, ContentLength: bytes.length };
      if (command instanceof GetObjectCommand)
        return { Metadata: stored!.Metadata, Body: Readable.from(bytes) };
      throw new Error("Unexpected S3 command");
    });
    await store.saveAsset({
      userId: "owner",
      assetId: "uuid",
      asset: bytes,
      metadata: { contentType: "model/stl", fileName, downloadOnly: true },
    });
    expect(stored?.Key).toBe("owner/uuid");
    for (const value of Object.values(stored!.Metadata!)) {
      expect(value).toMatch(/^[\x20-\x7E]*$/);
      expect(() => validateHeaderValue("metadata", value)).not.toThrow();
    }
    expect(await store.readAsset({ userId: "owner", assetId: "uuid" })).toEqual(
      {
        asset: bytes,
        metadata: { contentType: "model/stl", fileName, downloadOnly: true },
      },
    );
  });

  it("keeps long Unicode filenames within the S3 metadata budget", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const store = new S3AssetStore(client, "test");
    const fileName = "模".repeat(230) + ".stl";
    const send = vi.spyOn(client, "send").mockImplementation(async () => ({}));
    await store.saveAsset({
      userId: "owner",
      assetId: "uuid",
      asset: Buffer.from("mesh"),
      metadata: { contentType: "model/stl", fileName, downloadOnly: true },
    });
    const command = send.mock.calls[0][0] as PutObjectCommand;
    const metadata = command.input.Metadata!;
    expect(
      Object.entries(metadata).reduce(
        (size, [key, value]) =>
          size + Buffer.byteLength(key) + Buffer.byteLength(value),
        0,
      ),
    ).toBeLessThan(2048);
    send.mockImplementation(async () => ({ Metadata: metadata }));
    expect(
      await store.readAssetMetadata({ userId: "owner", assetId: "uuid" }),
    ).toEqual({
      contentType: "model/stl",
      fileName,
      downloadOnly: true,
    });
  });

  it("reads URI-encoded metadata from earlier versions", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const store = new S3AssetStore(client, "test");
    vi.spyOn(client, "send").mockImplementation(async () => ({
      Metadata: {
        "x-amz-meta-content-type": "model/stl",
        "x-amz-meta-file-name": encodeURIComponent("模型.stl"),
        "x-amz-meta-file-name-encoding": "uri",
      },
    }));
    expect(
      await store.readAssetMetadata({ userId: "owner", assetId: "uuid" }),
    ).toEqual({
      contentType: "model/stl",
      fileName: "模型.stl",
    });
  });

  it("reads old metadata unchanged, including literal percent escapes and null names", async () => {
    const client = new S3Client({ region: "us-east-1" });
    const store = new S3AssetStore(client, "test");
    const send = vi.spyOn(client, "send");
    for (const fileName of ["literal%20.pdf", undefined]) {
      send.mockImplementation(async () => ({
        Metadata: {
          "x-amz-meta-content-type": "application/pdf",
          ...(fileName ? { "x-amz-meta-file-name": fileName } : {}),
        },
      }));
      expect(
        await store.readAssetMetadata({ userId: "owner", assetId: "uuid" }),
      ).toEqual({ contentType: "application/pdf", fileName: fileName ?? null });
    }
  });

  it("still rejects unsupported types without a download-only flag", async () => {
    const store = new S3AssetStore(
      new S3Client({ region: "us-east-1" }),
      "test",
    );
    await expect(
      store.saveAsset({
        userId: "owner",
        assetId: "uuid",
        asset: Buffer.from("opaque"),
        metadata: { contentType: "model/stl" },
      }),
    ).rejects.toThrow("Unsupported asset type");
  });
});
