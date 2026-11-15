import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser, uploadTestAsset } from "../../utils/api";
import { createTestPdfFileWithText } from "../../utils/assets";
import { waitUntil } from "../../utils/general";

// "local" parses the assets itself. "remote" has the remote sandbox (the
// sandbox service in docker-compose.yml) parse them.
describe.each([
  { mode: "local", port: inject("karakeepPort") },
  { mode: "remote", port: inject("karakeepRemotePort") },
])("Asset Preprocessing Tests ($mode)", ({ port }) => {
  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  async function getBookmark(bookmarkId: string) {
    const { data } = await client.GET("/bookmarks/{bookmarkId}", {
      params: { path: { bookmarkId }, query: { includeContent: true } },
    });
    assert(data);
    return data;
  }

  beforeEach(async () => {
    apiKey = await createTestUser(undefined, String(port));
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it("extracts a PDF's text and screenshots its first page", async () => {
    const { assetId } = await uploadTestAsset(
      apiKey,
      port,
      createTestPdfFileWithText(),
    );
    const { data: created } = await client.POST("/bookmarks", {
      body: { type: "asset", assetType: "pdf", assetId },
    });
    assert(created);

    await waitUntil(
      async () => {
        const b = await getBookmark(created.id);
        return (
          b.content.type === "asset" &&
          !!b.content.content &&
          b.assets.some((a) => a.assetType === "assetScreenshot")
        );
      },
      "PDF is preprocessed",
      60000,
    );
    const bookmark = await getBookmark(created.id);
    assert(bookmark.content.type === "asset");
    expect(bookmark.content.content).toContain(
      "Karakeep asset summarization end to end test document.",
    );

    const screenshot = bookmark.assets.find(
      (a) => a.assetType === "assetScreenshot",
    );
    assert(screenshot);
    const response = await fetch(
      `http://localhost:${port}/api/v1/assets/${screenshot.id}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    expect(response.status).toBe(200);
    const png = Buffer.from(await response.arrayBuffer());
    expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
  });
});
