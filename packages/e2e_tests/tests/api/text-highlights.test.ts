import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";

describe("Text Bookmark Highlights API", () => {
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

  it("should create highlights on text bookmarks with markdown content", async () => {
    // Create a text bookmark with markdown content
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Markdown Test Bookmark",
        text: `# Heading 1

This is a **bold** text with *italic* content.

## Heading 2

Here's a list:
- Item 1
- Item 2
- Item 3

And a code block:
\`\`\`javascript
console.log("Hello, world!");
\`\`\`

Final paragraph with more text to highlight.`,
      },
    });

    expect(createdBookmark).toBeDefined();
    expect(createdBookmark?.content.type).toBe("text");

    // Create highlights on different parts of the markdown text
    const highlights = [
      {
        text: "Heading 1",
        startOffset: 2,
        endOffset: 11,
        color: "yellow" as const,
        note: "Main heading",
      },
      {
        text: "bold",
        startOffset: 27,
        endOffset: 31,
        color: "red" as const,
        note: "Bold text",
      },
      {
        text: "italic",
        startOffset: 43,
        endOffset: 49,
        color: "green" as const,
        note: "Italic text",
      },
      {
        text: "console.log",
        startOffset: 150,
        endOffset: 161,
        color: "blue" as const,
        note: "JavaScript code",
      },
    ];

    const createdHighlights = [];
    for (const highlight of highlights) {
      const { data: createdHighlight, response } = await client.POST(
        "/highlights",
        {
          body: {
            bookmarkId: createdBookmark!.id,
            startOffset: highlight.startOffset,
            endOffset: highlight.endOffset,
            text: highlight.text,
            note: highlight.note,
            color: highlight.color,
          },
        },
      );

      expect(response.status).toBe(201);
      expect(createdHighlight).toBeDefined();
      expect(createdHighlight?.text).toBe(highlight.text);
      expect(createdHighlight?.color).toBe(highlight.color);
      expect(createdHighlight?.note).toBe(highlight.note);
      createdHighlights.push(createdHighlight!);
    }

    // Verify all highlights are retrievable for the bookmark
    const { data: bookmarkHighlights } = await client.GET(
      "/bookmarks/{bookmarkId}/highlights",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(bookmarkHighlights!.highlights.length).toBe(4);
    expect(bookmarkHighlights!.highlights.map((h) => h.color)).toContain(
      "yellow",
    );
    expect(bookmarkHighlights!.highlights.map((h) => h.color)).toContain("red");
    expect(bookmarkHighlights!.highlights.map((h) => h.color)).toContain(
      "green",
    );
    expect(bookmarkHighlights!.highlights.map((h) => h.color)).toContain(
      "blue",
    );

    // Test updating highlight colors
    const firstHighlight = createdHighlights[0];
    const { data: updatedHighlight } = await client.PATCH(
      "/highlights/{highlightId}",
      {
        params: {
          path: {
            highlightId: firstHighlight.id,
          },
        },
        body: {
          color: "blue",
        },
      },
    );

    expect(updatedHighlight!.color).toBe("blue");

    // Test deleting highlights
    for (const highlight of createdHighlights) {
      const { response } = await client.DELETE("/highlights/{highlightId}", {
        params: {
          path: {
            highlightId: highlight.id,
          },
        },
      });
      expect(response.status).toBe(200);
    }

    // Verify highlights are deleted
    const { data: emptyHighlights } = await client.GET(
      "/bookmarks/{bookmarkId}/highlights",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(emptyHighlights!.highlights.length).toBe(0);
  });

  it("should handle overlapping highlights correctly", async () => {
    // Create a text bookmark
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Overlapping Highlights Test",
        text: "This is a test sentence with overlapping words to highlight.",
      },
    });

    // Create overlapping highlights
    const { data: highlight1 } = await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 5,
        endOffset: 15, // "is a test"
        text: "is a test",
        color: "yellow",
        note: "First overlap",
      },
    });

    const { data: highlight2 } = await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 10,
        endOffset: 20, // "test sent"
        text: "test sent",
        color: "red",
        note: "Second overlap",
      },
    });

    expect(highlight1).toBeDefined();
    expect(highlight2).toBeDefined();

    // Verify both highlights exist
    const { data: highlights } = await client.GET(
      "/bookmarks/{bookmarkId}/highlights",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(highlights!.highlights.length).toBe(2);
  });

  it("should handle highlights with special characters and unicode", async () => {
    // Create a text bookmark with special characters
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Unicode Test",
        text: 'This text contains émojis 🎉, special characters like ñ and ü, and quotes "like this".',
      },
    });

    // Create highlight on emoji
    const { data: emojiHighlight } = await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 27,
        endOffset: 29, // "🎉"
        text: "🎉",
        color: "yellow",
        note: "Emoji highlight",
      },
    });

    // Create highlight on special characters
    const { data: specialCharHighlight } = await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 55,
        endOffset: 61, // "ñ and ü"
        text: "ñ and ü",
        color: "blue",
        note: "Special chars",
      },
    });

    expect(emojiHighlight).toBeDefined();
    expect(emojiHighlight?.text).toBe("🎉");
    expect(specialCharHighlight).toBeDefined();
    expect(specialCharHighlight?.text).toBe("ñ and ü");

    // Verify highlights are correctly stored
    const { data: highlights } = await client.GET(
      "/bookmarks/{bookmarkId}/highlights",
      {
        params: {
          path: {
            bookmarkId: createdBookmark!.id,
          },
        },
      },
    );

    expect(highlights!.highlights.length).toBe(2);
    expect(highlights!.highlights.find((h) => h.text === "🎉")).toBeDefined();
    expect(
      highlights!.highlights.find((h) => h.text === "ñ and ü"),
    ).toBeDefined();
  });

  it("should validate highlight offsets are within text bounds", async () => {
    // Create a text bookmark
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Offset Validation Test",
        text: "Short text",
      },
    });

    // Try to create highlight with invalid offsets (beyond text length)
    const { response } = await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 15,
        endOffset: 25,
        text: "Invalid",
        color: "yellow",
        note: "Invalid range",
      },
    });

    // Should fail with bad request
    expect(response.status).toBe(400);
  });

  it("should handle empty or whitespace-only selections", async () => {
    // Create a text bookmark
    const { data: createdBookmark } = await client.POST("/bookmarks", {
      body: {
        type: "text",
        title: "Whitespace Test",
        text: "Word1    Word2    Word3",
      },
    });

    // Try to highlight only spaces
    const { data: spaceHighlight } = await client.POST("/highlights", {
      body: {
        bookmarkId: createdBookmark!.id,
        startOffset: 5,
        endOffset: 9, // "    " (spaces)
        text: "    ",
        color: "yellow",
        note: "Whitespace only",
      },
    });

    expect(spaceHighlight).toBeDefined();
    expect(spaceHighlight?.text).toBe("    ");
  });
});
