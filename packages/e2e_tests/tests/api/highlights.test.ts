import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Highlights API", () => {
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

  it("should create, get, update and delete a highlight", async () => {
    // Create a bookmark first
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    // Create a new highlight
    const { data: createdHighlight, response: createResponse } =
      await client.POST("/highlights", {
        body: {
          bookmarkId: createdBookmark!.id,
          startOffset: 0,
          endOffset: 5,
          text: "This ",
          note: "Test note",
          color: "yellow",
        },
      });

    expect(createResponse.status).toBe(201);
    expect(createdHighlight).toBeDefined();
    expect(createdHighlight?.id).toBeDefined();
    expect(createdHighlight?.text).toBe("This ");
    expect(createdHighlight?.note).toBe("Test note");

    // Get the created highlight
    const { data: retrievedHighlight, response: getResponse } =
      await client.GET("/highlights/{highlightId}", {
        params: {
          path: {
            highlightId: createdHighlight!.id,
          },
        },
      });

    expect(getResponse.status).toBe(200);
    expect(retrievedHighlight!.id).toBe(createdHighlight!.id);
    expect(retrievedHighlight!.text).toBe("This ");
    expect(retrievedHighlight!.note).toBe("Test note");

    // Update the highlight
    const { data: updatedHighlight, response: updateResponse } =
      await client.PATCH("/highlights/{highlightId}", {
        params: {
          path: {
            highlightId: createdHighlight!.id,
          },
        },
        body: {
          color: "blue",
        },
      });

    expect(updateResponse.status).toBe(200);
    expect(updatedHighlight!.color).toBe("blue");

    // Delete the highlight
    const { response: deleteResponse } = await client.DELETE(
      "/highlights/{highlightId}",
      {
        params: {
          path: {
            highlightId: createdHighlight!.id,
          },
        },
      },
    );

    expect(deleteResponse.status).toBe(200);

    // Verify it's deleted
    const { response: getDeletedResponse } = await client.GET(
      "/highlights/{highlightId}",
      {
        params: {
          path: {
            highlightId: createdHighlight!.id,
          },
        },
      },
    );

    expect(getDeletedResponse.status).toBe(404);
  });

  it("should paginate through highlights", async () => {
    // Create a bookmark first
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    // Create multiple highlights
    const highlightPromises = Array.from({ length: 5 }, (_, i) =>
      client.POST("/highlights", {
        body: {
          bookmarkId: createdBookmark!.id,
          startOffset: i * 5,
          endOffset: (i + 1) * 5,
          text: `Highlight ${i}`,
          note: `Note ${i}`,
        },
      }),
    );

    await Promise.all(highlightPromises);

    // Get first page
    const { data: firstPage, response: firstResponse } = await client.GET(
      "/highlights",
      {
        params: {
          query: {
            limit: 2,
          },
        },
      },
    );

    expect(firstResponse.status).toBe(200);
    expect(firstPage!.highlights.length).toBe(2);
    expect(firstPage!.nextCursor).toBeDefined();

    // Get second page
    const { data: secondPage, response: secondResponse } = await client.GET(
      "/highlights",
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
    expect(secondPage!.highlights.length).toBe(2);
    expect(secondPage!.nextCursor).toBeDefined();

    // Get final page
    const { data: finalPage, response: finalResponse } = await client.GET(
      "/highlights",
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
    expect(finalPage!.highlights.length).toBe(1);
    expect(finalPage!.nextCursor).toBeNull();
  });

  it("should get highlights for a bookmark", async () => {
    // Create a bookmark first
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Test Bookmark",
        text: "This is a test bookmark",
      },
    });

    // Create highlights
    await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 0,
        endOffset: 5,
        text: "This ",
        note: "First highlight",
        color: "yellow",
      },
    });

    await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 5,
        endOffset: 10,
        text: "is a ",
        note: "Second highlight",
        color: "blue",
      },
    });

    // Get highlights for bookmark
    const { data: highlights, response: getResponse } = await client.GET(
      "/bookmarks/{bookmarkId}/highlights",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(getResponse.status).toBe(200);
    expect(highlights!.highlights.length).toBe(2);
    expect(highlights!.highlights.map((h) => h.text)).toContain("This ");
    expect(highlights!.highlights.map((h) => h.text)).toContain("is a ");
  });
});
