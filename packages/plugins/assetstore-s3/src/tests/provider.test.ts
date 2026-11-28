import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { S3AssetStoreProvider } from "../../index";

describe("S3AssetStoreProvider", () => {
  it("returns one client across concurrent calls", async () => {
    const provider = new S3AssetStoreProvider({
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      forcePathStyle: true,
      bucket: "test",
      accessKeyId: "test",
      secretAccessKey: "test",
    });

    const [first, second] = await Promise.all([
      provider.getClient(),
      provider.getClient(),
    ]);

    expect(first).toBe(second);
  });

  describe("uploads to S3-compatible stores", () => {
    const requests: { method?: string; headers: IncomingHttpHeaders }[] = [];
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        requests.push({ method: req.method, headers: req.headers });
        res.writeHead(200, { ETag: '"etag"' });
        res.end();
      });
    });
    let endpoint: string;

    beforeAll(async () => {
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it.each(["saveAsset", "saveAssetFromFile"] as const)(
      "%s does not send checksum headers or aws-chunked encoding",
      async (method) => {
        const provider = new S3AssetStoreProvider({
          region: "us-east-1",
          endpoint,
          forcePathStyle: true,
          bucket: "test",
          accessKeyId: "test",
          secretAccessKey: "test",
        });
        const store = await provider.getClient();
        const metadata = { contentType: "text/html", fileName: null };

        if (method === "saveAsset") {
          await store.saveAsset({
            userId: "user",
            assetId: "asset",
            asset: Buffer.from("hello"),
            metadata,
          });
        } else {
          const assetPath = join(tmpdir(), `s3-provider-test-${Date.now()}`);
          await writeFile(assetPath, "hello");
          try {
            await store.saveAssetFromFile({
              userId: "user",
              assetId: "asset",
              assetPath,
              metadata,
            });
          } finally {
            await rm(assetPath, { force: true });
          }
        }

        const put = requests.pop();
        expect(put?.method).toBe("PUT");
        const headers = put!.headers;
        expect(
          Object.keys(headers).filter((h) => h.startsWith("x-amz-checksum")),
        ).toEqual([]);
        expect(headers["x-amz-sdk-checksum-algorithm"]).toBeUndefined();
        expect(headers["x-amz-trailer"]).toBeUndefined();
        expect(headers["content-encoding"] ?? "").not.toContain("aws-chunked");
      },
    );
  });
});
