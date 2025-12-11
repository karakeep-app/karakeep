import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Lists API", () => {
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

  it("should list all lists", async () => {
    // Create multiple lists
    const { data: list1 } = await client.POST("/lists", {
      body: {
        name: "First List",
        icon: "🚀",
      },
    });

    const { data: list2 } = await client.POST("/lists", {
      body: {
        name: "Second List",
        icon: "📚",
        type: "smart",
        query: "is:fav",
      },
    });

    // Get all lists
    const { data: allLists, response: getResponse } = await client.GET(
      "/lists",
      {
        params: {},
      },
    );

    expect(getResponse.status).toBe(200);
    expect(allLists).toBeDefined();
    expect(allLists!.lists.length).toBeGreaterThanOrEqual(2);

    const listIds = allLists!.lists.map((l) => l.id);
    expect(listIds).toContain(list1!.id);
    expect(listIds).toContain(list2!.id);
  });

  it("should create, get, update and delete a list", async () => {
    // Create a new list
    const { data: createdList, response: createResponse } = await client.POST(
      "/lists",
      {
        body: {
          name: "Test List",
          icon: "🚀",
        },
      },
    );

    expect(createResponse.status).toBe(201);
    expect(createdList).toBeDefined();
    expect(createdList?.id).toBeDefined();
    expect(createdList?.name).toBe("Test List");

    // Get the created list
    const { data: retrievedList, response: getResponse } = await client.GET(
      "/lists/{listId}",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(retrievedList!.id).toBe(createdList!.id);
    expect(retrievedList!.name).toBe("Test List");

    // Update the list
    const { data: updatedList, response: updateResponse } = await client.PATCH(
      "/lists/{listId}",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
        body: {
          name: "Updated List",
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(updatedList!.name).toBe("Updated List");

    // Delete the list
    const { response: deleteResponse } = await client.DELETE(
      "/lists/{listId}",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
      },
    );

    expect(deleteResponse.status).toBe(204);

    // Verify it's deleted
    const { response: getDeletedResponse } = await client.GET(
      "/lists/{listId}",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
      },
    );

    expect(getDeletedResponse.status).toBe(404);
  });

  it("should manage bookmarks in a list", async () => {
    // Create a list
    const { data: createdList } = await client.POST("/lists", {
      body: {
        name: "Test List",
        icon: "🚀",
      },
    });

    // Create a bookmark
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    // Add bookmark to list
    const { response: addResponse } = await client.PUT(
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

    expect(addResponse.status).toBe(204);

    // Get bookmarks in list
    const { data: listBookmarks, response: getResponse } = await client.GET(
      "/lists/{listId}/bookmarks",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(listBookmarks!.bookmarks.length).toBe(1);
    expect(listBookmarks!.bookmarks[0].id).toBe(createdBookmark!.id);

    // Remove bookmark from list
    const { response: removeResponse } = await client.DELETE(
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

    expect(removeResponse.status).toBe(204);

    // Verify bookmark is removed
    const { data: updatedListBookmarks } = await client.GET(
      "/lists/{listId}/bookmarks",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
      },
    );

    expect(updatedListBookmarks!.bookmarks.length).toBe(0);
  });

  it("should support smart lists", async () => {
    // Create a bookmark
    const { data: createdBookmark1 } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
        favourited: true,
      },
    });

    const { data: _ } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
        favourited: false,
      },
    });

    // Create a list
    const { data: createdList } = await client.POST("/lists", {
      body: {
        name: "Test List",
        icon: "🚀",
        type: "smart",
        query: "is:fav",
      },
    });

    // Get bookmarks in list
    const { data: listBookmarks, response: getResponse } = await client.GET(
      "/lists/{listId}/bookmarks",
      {
        params: {
          path: {
            listId: createdList!.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(listBookmarks!.bookmarks.length).toBe(1);
    expect(listBookmarks!.bookmarks[0].id).toBe(createdBookmark1!.id);
  });
});
