import * as fs from "fs";
import * as path from "path";
import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

const videoFixture = fs.readFileSync(
  path.join(__dirname, "../../setup/html/video.mp4"),
);

// "local" downloads the videos itself. "remote" has the remote sandbox (the
// sandbox service in docker-compose.yml) download them, and can't reach the
// test site itself.
describe.each([
  { mode: "local", port: inject("karakeepPort") },
  { mode: "remote", port: inject("karakeepRemotePort") },
])("Video Worker Tests ($mode)", ({ port }) => {
  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  async function getBookmark(bookmarkId: string) {
    const { data } = await client.GET(`/bookmarks/{bookmarkId}`, {
      params: {
        path: {
          bookmarkId,
        },
        query: {
          includeContent: true,
        },
      },
    });
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

  it("downloads a video attachment using yt-dlp", async () => {
    let { data: bookmark } = await client.POST("/bookmarks", {
      body: {
        type: "link",
        url: "http://nginx:80/video.html",
      },
    });
    assert(bookmark);

    await waitUntil(
      async () => {
        const data = await getBookmark(bookmark!.id);
        assert(data);
        assert(data.content.type === "link");
        return !!data.content.videoAssetId;
      },
      "Video attachment is downloaded",
      120000,
    );

    bookmark = await getBookmark(bookmark.id);
    assert(bookmark && bookmark.content.type === "link");
    expect(bookmark.content.videoAssetId).toBeDefined();
    expect(bookmark.assets.find((a) => a.assetType === "video")).toBeDefined();

    const response = await fetch(
      `http://localhost:${port}/api/v1/assets/${bookmark.content.videoAssetId}`,
      { headers: { authorization: `Bearer ${apiKey}` } },
    );
    expect(response.status).toBe(200);
    const video = Buffer.from(await response.arrayBuffer());
    expect(Buffer.compare(video, videoFixture)).toBe(0);
  });
});
