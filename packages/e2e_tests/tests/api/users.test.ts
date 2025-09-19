import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Users API", () => {
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

  it("should respond with user info", async () => {
    // Get the user info
    const { data: userInfo } = await client.GET("/users/me");
    expect(userInfo).toBeDefined();
    expect(userInfo?.name).toEqual("Test User");
  });

  it("should respond with user stats", async () => {
    ////////////////////////////////////////////////////////////////////////////////////
    // Prepare some data
    ////////////////////////////////////////////////////////////////////////////////////
    const { data: createdBookmark1 } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        text: "This is a test bookmark",
        favourited: true,
      },
    });
    await client.POST("/bookmarks", {
      body: {
        type: "text",
        text: "This is a test bookmark",
        archived: true,
      },
    });
    // Create a highlight
    await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark1!.id,
        startOffset: 0,
        endOffset: 5,
        text: "This is a test highlight",
        note: "Test note",
        color: "yellow",
      },
    });
    // attach a tag
    await client.POST("/bookmarks/{bookmarkId}/tags", {
      params: {
        path: {
          bookmarkId: createdBookmark1!.id,
        },
      },
      body: {
        tags: [{ tagName: "test-tag" }],
      },
    });
    // create two list
    await client.POST("/lists", {
      body: {
        name: "Test List",
        icon: "s",
      },
    });
    await client.POST("/lists", {
      body: {
        name: "Test List 2",
        icon: "s",
      },
    });

    ////////////////////////////////////////////////////////////////////////////////////
    // The actual test
    ////////////////////////////////////////////////////////////////////////////////////

    const { data: userStats } = await client.GET("/users/me/stats");

    expect(userStats).toBeDefined();
    expect(userStats?.numBookmarks).toBe(2);
    expect(userStats?.numFavorites).toBe(1);
    expect(userStats?.numArchived).toBe(1);
    expect(userStats?.numTags).toBe(1);
    expect(userStats?.numLists).toBe(2);
    expect(userStats?.numHighlights).toBe(1);
  });
});
