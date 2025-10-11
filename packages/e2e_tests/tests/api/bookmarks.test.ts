import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Bookmarks API", () => {
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

  it("should create and retrieve a bookmark", async () => {
    // Create a new bookmark
    const {
      data: createdBookmark,
      response: createResponse,
      error,
    } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    if (error) {
      console.error("Error creating bookmark:", error);
      throw error;
    }

    expect(createResponse.status).toBe(201);
    expect(createdBookmark).toBeDefined();
    expect(createdBookmark?.id).toBeDefined();

    // Get the created bookmark
    const { data: retrievedBookmark, response: getResponse } = await client.GET(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(retrievedBookmark!.id).toBe(createdBookmark.id);
    expect(retrievedBookmark!.title).toBe("Test Bookmark");
    assert(retrievedBookmark!.content.type === "text");
    expect(retrievedBookmark!.content.text).toBe("This is a test bookmark");
  });

  it("should update a bookmark", async () => {
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

    // Update the bookmark
    const { data: updatedBookmark, response: updateResponse } =
      await client.PATCH("/bookmarks/{bookmarkId}", {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
        body: {
          title: "Updated Title",
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updatedBookmark!.title).toBe("Updated Title");
  });

  it("should delete a bookmark", async () => {
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

    // Delete the bookmark
    const { response: deleteResponse } = await client.DELETE(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(deleteResponse.status).toBe(204);

    // Verify it's deleted
    const { response: getResponse } = await client.GET(
      "/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(404);
  });

  it("should paginate through bookmarks", async () => {
    // Create multiple bookmarks
    const bookmarkPromises = Array.from({ length: 5 }, (_, i) =>
      client.POST("/bookmarks", {
        body: {
          type: "text",
          title: `Test Bookmark ${i}`,
          text: `This is test bookmark ${i}`,
        },
      }),
    );

    const createdBookmarks = await Promise.all(bookmarkPromises);
    const bookmarkIds = createdBookmarks.map((b) => b.data!.id);

    // Get first page
    const { data: firstPage, response: firstResponse } = await client.GET(
      "/bookmarks",
      {
        params: {
          query: {
            limit: 2,
          },
        },
      },
    );

    expect(firstResponse.status).toBe(200);
    expect(firstPage!.bookmarks.length).toBe(2);
    expect(firstPage!.nextCursor).toBeDefined();

    // Get second page
    const { data: secondPage, response: secondResponse } = await client.GET(
      "/bookmarks",
      {
        params: {
          query: {
            limit: 2,
            cursor: firstPage!.nextCursor!,
          },
        },
      },
    );

    expect(secondResponse.status).toBe(200);
    expect(secondPage!.bookmarks.length).toBe(2);
    expect(secondPage!.nextCursor).toBeDefined();

    // Get final page
    const { data: finalPage, response: finalResponse } = await client.GET(
      "/bookmarks",
      {
        params: {
          query: {
            limit: 2,
            cursor: secondPage!.nextCursor!,
          },
        },
      },
    );

    expect(finalResponse.status).toBe(200);
    expect(finalPage!.bookmarks.length).toBe(1);
    expect(finalPage!.nextCursor).toBeNull();

    // Verify all bookmarks were returned
    const allBookmarks = [
      ...firstPage!.bookmarks,
      ...secondPage!.bookmarks,
      ...finalPage!.bookmarks,
    ];
    expect(allBookmarks.map((b) => b.id)).toEqual(
      expect.arrayContaining(bookmarkIds),
    );
  });

  it("should manage tags on a bookmark", async () => {
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

    // Add tags
    const { data: addTagsResponse, response: addTagsRes } = await client.POST(
      "/bookmarks/{bookmarkId}/tags",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
        body: {
          tags: [{ tagName: "test-tag" }],
        },
      },
    );

    expect(addTagsRes.status).toBe(200);
    expect(addTagsResponse!.attached.length).toBe(1);

    // Remove tags
    const { response: removeTagsRes } = await client.DELETE(
      "/bookmarks/{bookmarkId}/tags",
      {
        params: {
          path: {
            bookmarkId: createdBookmark.id,
          },
        },
        body: {
          tags: [{ tagId: addTagsResponse!.attached[0] }],
        },
      },
    );

    expect(removeTagsRes.status).toBe(200);
  });

  it("should get lists for a bookmark", async () => {
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    const { data: createdList } = await client.POST("/lists", {
      body: {
        name: "Test List",
        icon: "📚",
      },
    });

    const { response: addBookmarkResponse } = await client.PUT(
      "/lists/{listId}/bookmarks/{bookmarkId}",
      {
        params: {
          path: {
            listId: createdList!.id,
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(addBookmarkResponse.status).toBe(204);

    const { data: lists, response: getListsResponse } = await client.GET(
      "/bookmarks/{bookmarkId}/lists",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(getListsResponse.status).toBe(200);
    expect(lists!.lists.length).toBe(1);
    expect(lists!.lists[0].id).toBe(createdList!.id);
    expect(lists!.lists[0].name).toBe("Test List");
    expect(lists!.lists[0].icon).toBe("📚");
  });

  it("should search bookmarks", async () => {
    // Create test bookmarks
    await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Search Test 1",
        text: "This is a test bookmark for search",
      },
    });
    await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Search Test 2",
        text: "Another test bookmark for search",
      },
    });

    // Wait 3 seconds for the search index to be updated
    // TODO: Replace with a check that all queues are empty
    await new Promise((f) => setTimeout(f, 3000));

    // Search for bookmarks
    const { data: searchResults, response: searchResponse } = await client.GET(
      "/bookmarks/search",
      {
        params: {
          query: {
            q: "test bookmark",
          },
        },
      },
    );

    expect(searchResponse.status).toBe(200);
    expect(searchResults!.bookmarks.length).toBeGreaterThanOrEqual(2);
  });

  it("should paginate search results", async () => {
    // Create multiple bookmarks
    const bookmarkPromises = Array.from({ length: 5 }, (_, i) =>
      client.POST("/bookmarks", {
        body: {
          type: "text",
          title: `Search Pagination ${i}`,
          text: `This is test bookmark ${i} for pagination`,
        },
      }),
    );

    await Promise.all(bookmarkPromises);

    // Wait 3 seconds for the search index to be updated
    // TODO: Replace with a check that all queues are empty
    await new Promise((f) => setTimeout(f, 3000));

    // Get first page
    const { data: firstPage, response: firstResponse } = await client.GET(
      "/bookmarks/search",
      {
        params: {
          query: {
            q: "pagination",
            limit: 2,
          },
        },
      },
    );

    expect(firstResponse.status).toBe(200);
    expect(firstPage!.bookmarks.length).toBe(2);
    expect(firstPage!.nextCursor).toBeDefined();

    // Get second page
    const { data: secondPage, response: secondResponse } = await client.GET(
      "/bookmarks/search",
      {
        params: {
          query: {
            q: "pagination",
            limit: 2,
            cursor: firstPage!.nextCursor!,
          },
        },
      },
    );

    expect(secondResponse.status).toBe(200);
    expect(secondPage!.bookmarks.length).toBe(2);
    expect(secondPage!.nextCursor).toBeDefined();

    // Get final page
    const { data: finalPage, response: finalResponse } = await client.GET(
      "/bookmarks/search",
      {
        params: {
          query: {
            q: "pagination",
            limit: 2,
            cursor: secondPage!.nextCursor!,
          },
        },
      },
    );

    expect(finalResponse.status).toBe(200);
    expect(finalPage!.bookmarks.length).toBe(1);
    expect(finalPage!.nextCursor).toBeNull();
  });

  describe("singlefile", () => {
    async function uploadSinglefileAsset(ifexists?: string) {
      const file = new File(["<html>HELLO WORLD</html>"], "test.html", {
        type: "text/html",
      });

      const formData = new FormData();
      formData.append("url", "https://example.com");
      formData.append("file", file);

      const url = new URL(
        `http://localhost:${port}/api/v1/bookmarks/singlefile`,
      );
      if (ifexists) {
        url.searchParams.append("ifexists", ifexists);
      }

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        return [null, response] as const;
      }

      const data = (await response.json()) as { id: string };
      return [data, response] as const;
    }

    it("should support precrawling via singlefile with ifexists=skip", async () => {
      // First upload: create a bookmark
      const [data, response] = await uploadSinglefileAsset();
      expect(response?.status).toBe(201);
      const bookmarkId = data?.id;
      if (!bookmarkId) throw new Error("Bookmark ID not found");

      // Get the bookmark and record the precrawled asset id
      const { data: bookmark, response: getResponse1 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse1.status).toBe(200);
      const assetIds = bookmark!.assets
        .filter((a) => a.assetType === "precrawledArchive")
        .map((a) => a.id);
      expect(assetIds.length).toBe(1);
      const firstAssetId = assetIds[0];

      // Second upload with skip
      const [data2, response2] = await uploadSinglefileAsset("skip");
      expect(response2?.status).toBe(200);
      expect(data2?.id).toBe(bookmarkId);

      // Get the bookmark again
      const { data: bookmark2, response: getResponse2 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse2.status).toBe(200);
      const assetIds2 = bookmark2!.assets
        .filter((a) => a.assetType === "precrawledArchive")
        .map((a) => a.id);
      expect(assetIds2).toEqual([firstAssetId]); // same asset
    });

    it("should support precrawling via singlefile with ifexists=overwrite", async () => {
      // First upload
      const [data, response] = await uploadSinglefileAsset("overwrite");
      expect(response?.status).toBe(201);
      const bookmarkId = data?.id;
      if (!bookmarkId) throw new Error("Bookmark ID not found");

      // Record the asset
      const { data: bookmark, response: getResponse1 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse1.status).toBe(200);
      const firstAssetId = bookmark!.assets.find(
        (a) => a.assetType === "precrawledArchive",
      )?.id;
      expect(firstAssetId).toBeDefined();

      // Second upload with overwrite
      const [data2, response2] = await uploadSinglefileAsset("overwrite");
      expect(response2?.status).toBe(200);
      expect(data2?.id).toBe(bookmarkId);

      // Get the bookmark again
      const { data: bookmark2, response: getResponse2 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse2.status).toBe(200);
      const secondAssetId = bookmark2!.assets.find(
        (a) => a.assetType === "precrawledArchive",
      )?.id;
      expect(secondAssetId).toBeDefined();
      expect(secondAssetId).not.toBe(firstAssetId);
      // There should be only one precrawledArchive asset
      const precrawledAssets = bookmark2!.assets.filter(
        (a) => a.assetType === "precrawledArchive",
      );
      expect(precrawledAssets.length).toBe(1);
    });

    it("should support precrawling via singlefile with ifexists=overwrite-recrawl", async () => {
      // First upload
      const [data, response] = await uploadSinglefileAsset("overwrite-recrawl");
      expect(response?.status).toBe(201);
      const bookmarkId = data?.id;
      if (!bookmarkId) throw new Error("Bookmark ID not found");

      // Record the asset
      const { data: bookmark, response: getResponse1 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse1.status).toBe(200);
      const firstAssetId = bookmark!.assets.find(
        (a) => a.assetType === "precrawledArchive",
      )?.id;
      expect(firstAssetId).toBeDefined();

      // Second upload with overwrite-recrawl
      const [data2, response2] =
        await uploadSinglefileAsset("overwrite-recrawl");
      expect(response2?.status).toBe(200);
      expect(data2?.id).toBe(bookmarkId);

      // Get the bookmark again
      const { data: bookmark2, response: getResponse2 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse2.status).toBe(200);
      const secondAssetId = bookmark2!.assets.find(
        (a) => a.assetType === "precrawledArchive",
      )?.id;
      expect(secondAssetId).toBeDefined();
      expect(secondAssetId).not.toBe(firstAssetId);
      // There should be only one precrawledArchive asset
      const precrawledAssets = bookmark2!.assets.filter(
        (a) => a.assetType === "precrawledArchive",
      );
      expect(precrawledAssets.length).toBe(1);
    });

    it("should support precrawling via singlefile with ifexists=append", async () => {
      // First upload
      const [data, response] = await uploadSinglefileAsset("append");
      expect(response?.status).toBe(201);
      const bookmarkId = data?.id;
      if (!bookmarkId) throw new Error("Bookmark ID not found");

      // Record the first asset
      const { data: bookmark, response: getResponse1 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse1.status).toBe(200);
      const firstAssetId = bookmark!.assets.find(
        (a) => a.assetType === "precrawledArchive",
      )?.id;
      expect(firstAssetId).toBeDefined();

      // Second upload with append
      const [data2, response2] = await uploadSinglefileAsset("append");
      expect(response2?.status).toBe(200);
      expect(data2?.id).toBe(bookmarkId);

      // Get the bookmark again
      const { data: bookmark2, response: getResponse2 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse2.status).toBe(200);
      const precrawledAssets = bookmark2!.assets.filter(
        (a) => a.assetType === "precrawledArchive",
      );
      expect(precrawledAssets.length).toBe(2);
      expect(precrawledAssets.map((a) => a.id)).toContain(firstAssetId);
      // The second asset id should be different
      const secondAssetId = precrawledAssets.find(
        (asset) => asset.id !== firstAssetId,
      )?.id;
      expect(secondAssetId).toBeDefined();
    });

    it("should support precrawling via singlefile with ifexists=append-recrawl", async () => {
      // First upload
      const [data, response] = await uploadSinglefileAsset("append-recrawl");
      expect(response?.status).toBe(201);
      const bookmarkId = data?.id;
      if (!bookmarkId) throw new Error("Bookmark ID not found");

      // Record the first asset
      const { data: bookmark, response: getResponse1 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse1.status).toBe(200);
      const firstAssetId = bookmark!.assets.find(
        (a) => a.assetType === "precrawledArchive",
      )?.id;
      expect(firstAssetId).toBeDefined();

      // Second upload with append-recrawl
      const [data2, response2] = await uploadSinglefileAsset("append-recrawl");
      expect(response2?.status).toBe(200);
      expect(data2?.id).toBe(bookmarkId);

      // Get the bookmark again
      const { data: bookmark2, response: getResponse2 } = await client.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: { path: { bookmarkId } },
        },
      );
      expect(getResponse2.status).toBe(200);
      const precrawledAssets = bookmark2!.assets.filter(
        (a) => a.assetType === "precrawledArchive",
      );
      expect(precrawledAssets.length).toBe(2);
      expect(precrawledAssets.map((a) => a.id)).toContain(firstAssetId);
      // The second asset id should be different
      const secondAssetId = precrawledAssets.find(
        (asset) => asset.id !== firstAssetId,
      )?.id;
      expect(secondAssetId).toBeDefined();
    });
  });
});
