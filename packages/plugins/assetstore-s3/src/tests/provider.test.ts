import { describe, expect, it } from "vitest";

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
});
