import { describe, expect, it } from "vitest";

import { FileSystemAssetStoreProvider } from "../../index";

describe("FileSystemAssetStoreProvider", () => {
  it("returns one client across concurrent calls", async () => {
    const provider = new FileSystemAssetStoreProvider();

    const [first, second] = await Promise.all([
      provider.getClient(),
      provider.getClient(),
    ]);

    expect(first).toBe(second);
  });
});
