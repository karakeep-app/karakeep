import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";

describe("Feeds API", () => {
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

  it("should list feeds", async () => {
    const { data: firstFeed } = await client.POST("/feeds", {
      body: {
        name: "First Feed",
        url: "https://example.com/first.xml",
        enabled: true,
      },
    });
    const { data: secondFeed } = await client.POST("/feeds", {
      body: {
        name: "Second Feed",
        url: "https://example.com/second.xml",
        enabled: false,
        importTags: true,
      },
    });

    const { data: listedFeeds, response } = await client.GET("/feeds", {});

    expect(response.status).toBe(200);
    expect(listedFeeds).toBeDefined();
    expect(listedFeeds!.feeds.map((feed) => feed.id)).toEqual(
      expect.arrayContaining([firstFeed!.id, secondFeed!.id]),
    );
  });

  it("should create, get, update and delete a feed", async () => {
    const {
      data: createdFeed,
      response: createResponse,
      error,
    } = await client.POST("/feeds", {
      body: {
        name: "Test Feed",
        url: "https://example.com/feed.xml",
        enabled: true,
      },
    });

    if (error) {
      throw error;
    }

    expect(createResponse.status).toBe(201);
    expect(createdFeed).toBeDefined();
    expect(createdFeed?.id).toBeDefined();
    expect(createdFeed?.importTags).toBe(false);
    expect(createdFeed?.lastFetchedStatus).toBe("pending");
    expect(createdFeed?.lastFetchedAt).toBeNull();

    const { data: retrievedFeed, response: getResponse } = await client.GET(
      "/feeds/{feedId}",
      {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(retrievedFeed?.id).toBe(createdFeed!.id);
    expect(retrievedFeed?.name).toBe("Test Feed");

    const { data: updatedFeed, response: updateResponse } = await client.PATCH(
      "/feeds/{feedId}",
      {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
        body: {
          name: "Updated Feed",
          enabled: false,
          importTags: true,
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(updatedFeed?.name).toBe("Updated Feed");
    expect(updatedFeed?.enabled).toBe(false);
    expect(updatedFeed?.importTags).toBe(true);

    const { response: deleteResponse } = await client.DELETE(
      "/feeds/{feedId}",
      {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
      },
    );

    expect(deleteResponse.status).toBe(204);

    const { response: getDeletedResponse } = await client.GET(
      "/feeds/{feedId}",
      {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
      },
    );

    expect(getDeletedResponse.status).toBe(404);
  });

  it("should trigger an immediate fetch with POST and import feed entries", async () => {
    const { data: createdFeed, error: createError } = await client.POST(
      "/feeds",
      {
        body: {
          name: "Fetched Feed",
          url: "http://nginx:80/feed.xml",
          enabled: true,
        },
      },
    );

    if (createError) {
      throw createError;
    }

    const { response: fetchResponse } = await client.POST(
      "/feeds/{feedId}/fetch",
      {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
      },
    );

    expect(fetchResponse.status).toBe(204);

    await waitUntil(async () => {
      const { data: feed } = await client.GET("/feeds/{feedId}", {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
      });

      return feed?.lastFetchedStatus === "success";
    }, "feed fetch completes");

    const { data: fetchedFeed, response: getFeedResponse } = await client.GET(
      "/feeds/{feedId}",
      {
        params: {
          path: {
            feedId: createdFeed!.id,
          },
        },
      },
    );

    expect(getFeedResponse.status).toBe(200);
    expect(fetchedFeed?.lastFetchedStatus).toBe("success");
    expect(fetchedFeed?.lastFetchedAt).toBeTruthy();

    const { data: bookmarks, response: bookmarksResponse } = await client.GET(
      "/bookmarks",
      {
        params: {
          query: {
            archived: false,
          },
        },
      },
    );

    expect(bookmarksResponse.status).toBe(200);
    expect(bookmarks?.bookmarks).toHaveLength(2);

    const titles = bookmarks!.bookmarks.map((bookmark) => bookmark.title);
    expect(titles).toContain("First Test Article");
    expect(titles).toContain("Second Test Article");

    const urls = bookmarks!.bookmarks.map((bookmark) => {
      assert(bookmark.content.type === "link");
      return bookmark.content.url;
    });
    expect(urls).toContain("http://nginx:80/hello.html");
    expect(urls).toContain("http://nginx:80/hello.html?article=2");
  });
});
