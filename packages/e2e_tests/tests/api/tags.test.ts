import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Tags API", () => {
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

  it("should get, update and delete a tag", async () => {
    // Create a tag by attaching it to the bookmark
    const { data: tag } = await client.POST("/tags", {
      body: {
        name: "Test Tag",
      },
    });
    expect(tag).toBeDefined();
    expect(tag!.name).toBe("Test Tag");

    const tagId = tag!.id;

    // Get the tag
    const { data: retrievedTag, response: getResponse } = await client.GET(
      "/tags/{tagId}",
      {
        params: {
          path: {
            tagId,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(retrievedTag!.id).toBe(tagId);
    expect(retrievedTag!.name).toBe("Test Tag");

    // Update the tag
    const { data: updatedTag, response: updateResponse } = await client.PATCH(
      "/tags/{tagId}",
      {
        params: {
          path: {
            tagId,
          },
        },
        body: {
          name: "Updated Tag",
        },
      },
    );

    expect(updateResponse.status).toBe(200);
    expect(updatedTag!.name).toBe("Updated Tag");

    // Delete the tag
    const { response: deleteResponse } = await client.DELETE("/tags/{tagId}", {
      params: {
        path: {
          tagId,
        },
      },
    });

    expect(deleteResponse.status).toBe(204);

    // Verify it's deleted
    const { response: getDeletedResponse } = await client.GET("/tags/{tagId}", {
      params: {
        path: {
          tagId,
        },
      },
    });

    expect(getDeletedResponse.status).toBe(404);
  });

  it("should manage bookmarks with a tag", async () => {
    // Create a bookmark first
    const { data: firstBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    // Create a tag by attaching it to the bookmark
    const { data: addTagResponse } = await client.POST(
      "/bookmarks/{bookmarkId}/tags",
      {
        params: {
          path: {
            bookmarkId: firstBookmark!.id,
          },
        },
        body: {
          tags: [{ tagName: "Test Tag" }],
        },
      },
    );

    const tagId = addTagResponse!.attached[0];

    // Add tag to another bookmark
    const { data: secondBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Second Bookmark",
        text: "This is another test bookmark",
      },
    });

    const { data: addSecondTagResponse, response: addResponse } =
      await client.POST("/bookmarks/{bookmarkId}/tags", {
        params: {
          path: {
            bookmarkId: secondBookmark!.id,
          },
        },
        body: {
          tags: [{ tagId }],
        },
      });

    expect(addResponse.status).toBe(200);
    expect(addSecondTagResponse!.attached.length).toBe(1);

    // Get bookmarks with tag
    const { data: taggedBookmarks, response: getResponse } = await client.GET(
      "/tags/{tagId}/bookmarks",
      {
        params: {
          path: {
            tagId,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(taggedBookmarks!.bookmarks.length).toBe(2);
    expect(taggedBookmarks!.bookmarks.map((b) => b.id)).toContain(
      firstBookmark!.id,
    );
    expect(taggedBookmarks!.bookmarks.map((b) => b.id)).toContain(
      secondBookmark!.id,
    );

    // Remove tag from first bookmark
    const { response: removeResponse } = await client.DELETE(
      "/bookmarks/{bookmarkId}/tags",
      {
        params: {
          path: {
            bookmarkId: firstBookmark!.id,
          },
        },
        body: {
          tags: [{ tagId }],
        },
      },
    );

    expect(removeResponse.status).toBe(200);

    // Verify tag is still on second bookmark
    const { data: updatedTaggedBookmarks } = await client.GET(
      "/tags/{tagId}/bookmarks",
      {
        params: {
          path: {
            tagId,
          },
        },
      },
    );

    expect(updatedTaggedBookmarks!.bookmarks.length).toBe(1);
    expect(updatedTaggedBookmarks!.bookmarks[0].id).toBe(secondBookmark!.id);
  });
});
