import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser, uploadTestAsset } from "../../utils/api";

describe("Assets API", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let apiKey: string;

  beforeEach(async () => {
    apiKey = await createTestUser();
    client = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
    });
  });

  it("should upload and retrieve an asset", async () => {
    // Create a test file
    const file = new File(["test content"], "test.pdf", {
      type: "application/pdf",
    });

    // Upload the asset
    const uploadResponse = await uploadTestAsset(apiKey, port, file);
    expect(uploadResponse.assetId).toBeDefined();
    expect(uploadResponse.contentType).toBe("application/pdf");
    expect(uploadResponse.fileName).toBe("test.pdf");

    // Retrieve the asset
    const resp = await fetch(
      `http://localhost:${port}/api/v1/assets/${uploadResponse.assetId}`,
      {
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
      },
    );

    expect(resp.status).toBe(200);
  });

  it("should attach an asset to a bookmark", async () => {
    // Create a test file
    const file = new File(["test content"], "test.pdf", {
      type: "application/pdf",
    });

    // Upload the asset
    const uploadResponse = await uploadTestAsset(apiKey, port, file);

    // Create a bookmark
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "asset",
        title: "Test Asset Bookmark",
        assetType: "pdf",
        assetId: uploadResponse.assetId,
      },
    });

    expect(createdBookmark).toBeDefined();
    expect(createdBookmark?.id).toBeDefined();

    // Get the bookmark and verify asset
    const { data: retrievedBookmark } = await client.GET(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(retrievedBookmark).toBeDefined();
    assert(retrievedBookmark!.content.type === "asset");
    expect(retrievedBookmark!.content.assetId).toBe(uploadResponse.assetId);
  });

  it("should delete asset when deleting bookmark", async () => {
    // Create a test file
    const file = new File(["test content"], "test.pdf", {
      type: "application/pdf",
    });

    // Upload the asset
    const uploadResponse = await uploadTestAsset(apiKey, port, file);

    // Create a bookmark
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "asset",
        title: "Test Asset Bookmark",
        assetType: "pdf",
        assetId: uploadResponse.assetId,
      },
    });

    // Delete the bookmark
    const { response: deleteResponse } = await client.DELETE(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );
    expect(deleteResponse.status).toBe(204);

    // Verify asset is deleted
    const assetResponse = await fetch(
      `http://localhost:${port}/api/v1/assets/${uploadResponse.assetId}`,
      {
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
      },
    );
    expect(assetResponse.status).toBe(404);
  });

  it("should manage assets on a bookmark", async () => {
    // Create a new bookmark
    const { data: createdBookmark, error: createError } = await client.POST(
      "/bookmarks",
      {
        body: {
          type: "text",
          title: "Test Bookmark",
          text: "This is a test bookmark",
        },
      },
    );

    if (createError) {
      console.error("Error creating bookmark:", createError);
      throw createError;
    }
    if (!createdBookmark) {
      throw new Error("Bookmark creation failed");
    }

    const file = new File(["test content"], "test.pdf", {
      type: "application/pdf",
    });

    // Upload the asset
    const uploadResponse1 = await uploadTestAsset(apiKey, port, file);
    const uploadResponse2 = await uploadTestAsset(apiKey, port, file);
    const uploadResponse3 = await uploadTestAsset(apiKey, port, file);

    // Attach first asset
    const { data: firstAsset, response: attachFirstRes } = await client.POST(
      "/bookmarks/{bookmarkId}/assets",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
        body: {
          id: uploadResponse1.assetId,
          assetType: "bannerImage",
        },
      },
    );

    expect(attachFirstRes.status).toBe(201);
    expect(firstAsset).toEqual({
      id: uploadResponse1.assetId,
      assetType: "bannerImage",
      fileName: "test.pdf",
    });

    // Attach second asset
    const { data: secondAsset, response: attachSecondRes } = await client.POST(
      "/bookmarks/{bookmarkId}/assets",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
        body: {
          id: uploadResponse2.assetId,
          assetType: "bannerImage",
        },
      },
    );

    expect(attachSecondRes.status).toBe(201);
    expect(secondAsset).toEqual({
      id: uploadResponse2.assetId,
      assetType: "bannerImage",
      fileName: "test.pdf",
    });

    // Get bookmark and verify assets
    const { data: bookmarkWithAssets } = await client.GET(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(bookmarkWithAssets?.assets).toEqual(
      expect.arrayContaining([
        {
          id: uploadResponse1.assetId,
          assetType: "bannerImage",
          fileName: "test.pdf",
        },
        {
          id: uploadResponse2.assetId,
          assetType: "bannerImage",
          fileName: "test.pdf",
        },
      ]),
    );

    // Replace first asset
    const { response: replaceRes } = await client.PUT(
      "/bookmarks/{bookmarkId}/assets/{assetId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
            assetId: uploadResponse1.assetId,
          },
        },
        body: {
          assetId: uploadResponse3.assetId,
        },
      },
    );

    expect(replaceRes.status).toBe(204);

    // Verify replacement
    const { data: bookmarkAfterReplace } = await client.GET(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(bookmarkAfterReplace?.assets).toEqual(
      expect.arrayContaining([
        {
          id: uploadResponse3.assetId,
          assetType: "bannerImage",
          fileName: "test.pdf",
        },
        {
          id: uploadResponse2.assetId,
          assetType: "bannerImage",
          fileName: "test.pdf",
        },
      ]),
    );

    // Detach second asset
    const { response: detachRes } = await client.DELETE(
      "/bookmarks/{bookmarkId}/assets/{assetId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
            assetId: uploadResponse2.assetId,
          },
        },
      },
    );

    expect(detachRes.status).toBe(204);

    // Verify detachment
    const { data: bookmarkAfterDetach } = await client.GET(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(bookmarkAfterDetach?.assets).toEqual([
      {
        id: uploadResponse3.assetId,
        assetType: "bannerImage",
        fileName: "test.pdf",
      },
    ]);
  });
});
