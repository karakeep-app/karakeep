import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";
import { getTrpcClient } from "../../utils/trpc";

describe("Import Worker Tests", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let client: ReturnType<typeof createKarakeepClient>;
  let trpc: ReturnType<typeof getTrpcClient>;
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
    trpc = getTrpcClient(apiKey);
  });

  it("should import 15 bookmarks of different types", async () => {
    // Create lists first (lists require IDs, not paths)
    const { data: parentList } = await client.POST("/lists", {
      body: {
        name: "Import Test List",
        icon: "folder",
      },
    });
    assert(parentList);

    const { data: nestedList } = await client.POST("/lists", {
      body: {
        name: "Nested",
        icon: "folder",
        parentId: parentList.id,
      },
    });
    assert(nestedList);

    // Create an import session
    const { id: importSessionId } =
      await trpc.importSessions.createImportSession.mutate({
        name: "E2E Test Import",
      });
    assert(importSessionId);

    // Define 15 bookmarks of different types
    const bookmarksToImport = [
      // Links (7 total, with varying metadata)
      {
        type: "link" as const,
        url: "http://nginx:80/hello.html",
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page1.html",
        title: "Page 1 Title",
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page2.html",
        title: "Page 2 with Note",
        note: "This is a note for page 2",
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page3.html",
        title: "Page 3 with Tags",
        tags: ["tag1", "tag2"],
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page4.html",
        title: "Page 4 with List",
        listIds: [parentList.id],
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page5.html",
        title: "Page 5 with Source Date",
        sourceAddedAt: new Date("2024-01-15T10:30:00Z"),
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page6.html",
        title: "Page 6 Full Metadata",
        note: "Full metadata note",
        tags: ["imported", "full"],
        listIds: [nestedList.id],
        sourceAddedAt: new Date("2024-02-20T15:45:00Z"),
      },

      // Text bookmarks (5 total)
      {
        type: "text" as const,
        content: "This is a basic text bookmark content.",
      },
      {
        type: "text" as const,
        title: "Text with Title",
        content: "Text bookmark with a title.",
      },
      {
        type: "text" as const,
        title: "Text with Tags",
        content: "Text bookmark with tags attached.",
        tags: ["text-tag", "imported"],
      },
      {
        type: "text" as const,
        title: "Text with Note",
        content: "Text bookmark content here.",
        note: "A note attached to this text bookmark.",
      },
      {
        type: "text" as const,
        title: "Text Full Metadata",
        content: "Text bookmark with all metadata fields.",
        note: "Complete text note",
        tags: ["complete", "text"],
        listIds: [parentList.id],
        sourceAddedAt: new Date("2024-03-10T08:00:00Z"),
      },

      // Duplicates (3 total - same URLs as earlier links)
      {
        type: "link" as const,
        url: "http://nginx:80/hello.html", // Duplicate of link #1
        title: "Duplicate of Hello",
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page1.html", // Duplicate of link #2
        title: "Duplicate of Page 1",
      },
      {
        type: "link" as const,
        url: "http://nginx:80/page2.html", // Duplicate of link #3
        title: "Duplicate of Page 2",
        note: "Different note but same URL",
      },
    ];

    // Stage all bookmarks
    await trpc.importSessions.stageImportedBookmarks.mutate({
      importSessionId,
      bookmarks: bookmarksToImport,
    });

    // Finalize the import to trigger processing
    await trpc.importSessions.finalizeImportStaging.mutate({
      importSessionId,
    });

    // Wait for all bookmarks to be processed
    await waitUntil(
      async () => {
        const stats = await trpc.importSessions.getImportSessionStats.query({
          importSessionId,
        });
        const allProcessed =
          stats.completedBookmarks + stats.failedBookmarks ===
          stats.totalBookmarks;
        console.log(
          `Import progress: ${stats.completedBookmarks} completed, ${stats.failedBookmarks} failed, ${stats.totalBookmarks} total`,
        );
        return allProcessed && stats.totalBookmarks === 15;
      },
      "All bookmarks are processed",
      120000, // 2 minutes timeout
    );

    // Get final stats
    const finalStats = await trpc.importSessions.getImportSessionStats.query({
      importSessionId,
    });

    expect(finalStats.totalBookmarks).toBe(15);
    expect(finalStats.completedBookmarks).toBe(15);
    expect(finalStats.failedBookmarks).toBe(0);
    expect(finalStats.status).toBe("completed");

    // Get results by filter
    const acceptedResults =
      await trpc.importSessions.getImportSessionResults.query({
        importSessionId,
        filter: "accepted",
        limit: 50,
      });

    const duplicateResults =
      await trpc.importSessions.getImportSessionResults.query({
        importSessionId,
        filter: "skipped_duplicate",
        limit: 50,
      });

    // We expect 12 accepted (7 links + 5 text) and 3 duplicates
    expect(acceptedResults.items.length).toBe(12);
    expect(duplicateResults.items.length).toBe(3);

    // Verify duplicates reference the original bookmarks
    for (const dup of duplicateResults.items) {
      expect(dup.resultBookmarkId).toBeDefined();
      expect(dup.result).toBe("skipped_duplicate");
    }

    // Verify accepted bookmarks have resultBookmarkId
    for (const accepted of acceptedResults.items) {
      expect(accepted.resultBookmarkId).toBeDefined();
      expect(accepted.result).toBe("accepted");
    }

    // Verify actual bookmarks were created via the API
    const { data: allBookmarks } = await client.GET("/bookmarks", {
      params: {
        query: {
          limit: 50,
        },
      },
    });
    assert(allBookmarks);

    // Should have 12 unique bookmarks (7 links + 5 text)
    expect(allBookmarks.bookmarks.length).toBe(12);

    // Verify link bookmarks
    const linkBookmarks = allBookmarks.bookmarks.filter(
      (b) => b.content.type === "link",
    );
    expect(linkBookmarks.length).toBe(7);

    // Verify text bookmarks
    const textBookmarks = allBookmarks.bookmarks.filter(
      (b) => b.content.type === "text",
    );
    expect(textBookmarks.length).toBe(5);

    // Verify tags were created
    const { data: tagsResponse } = await client.GET("/tags", {});
    assert(tagsResponse);
    const tagNames = tagsResponse.tags.map((t) => t.name);
    expect(tagNames).toContain("tag1");
    expect(tagNames).toContain("tag2");
    expect(tagNames).toContain("imported");
    expect(tagNames).toContain("text-tag");
    expect(tagNames).toContain("complete");

    // Verify tags are actually attached to bookmarks
    // Find a bookmark with tags and verify
    const bookmarkWithTags = allBookmarks.bookmarks.find((b) =>
      b.tags.some((t) => t.name === "tag1"),
    );
    assert(bookmarkWithTags, "Should find a bookmark with tag1");
    expect(bookmarkWithTags.tags.map((t) => t.name)).toContain("tag1");
    expect(bookmarkWithTags.tags.map((t) => t.name)).toContain("tag2");

    // Verify "imported" tag is on multiple bookmarks (used in link and text)
    const bookmarksWithImportedTag = allBookmarks.bookmarks.filter((b) =>
      b.tags.some((t) => t.name === "imported"),
    );
    expect(bookmarksWithImportedTag.length).toBeGreaterThanOrEqual(2);

    // Verify bookmarks are actually in the lists
    const { data: parentListBookmarks } = await client.GET(
      "/lists/{listId}/bookmarks",
      {
        params: {
          path: { listId: parentList.id },
        },
      },
    );
    assert(parentListBookmarks);
    // Should have bookmarks with listIds containing parentList.id
    expect(parentListBookmarks.bookmarks.length).toBeGreaterThanOrEqual(2);

    // Verify nested list has bookmarks
    const { data: nestedListBookmarks } = await client.GET(
      "/lists/{listId}/bookmarks",
      {
        params: {
          path: { listId: nestedList.id },
        },
      },
    );
    assert(nestedListBookmarks);
    // Should have the bookmark with listIds containing nestedList.id
    expect(nestedListBookmarks.bookmarks.length).toBeGreaterThanOrEqual(1);
  });

  it("should attach imported bookmarks to root list", async () => {
    // Create a root list first
    const { data: rootList } = await client.POST("/lists", {
      body: {
        name: "Import Root List",
        icon: "folder",
      },
    });
    assert(rootList);

    // Create import session with rootListId
    const { id: importSessionId } =
      await trpc.importSessions.createImportSession.mutate({
        name: "Root List Import Test",
        rootListId: rootList.id,
      });

    // Stage bookmarks
    await trpc.importSessions.stageImportedBookmarks.mutate({
      importSessionId,
      bookmarks: [
        { type: "text" as const, content: "Root list bookmark 1" },
        { type: "text" as const, content: "Root list bookmark 2" },
      ],
    });

    // Finalize
    await trpc.importSessions.finalizeImportStaging.mutate({
      importSessionId,
    });

    // Wait for completion
    await waitUntil(
      async () => {
        const stats = await trpc.importSessions.getImportSessionStats.query({
          importSessionId,
        });
        return stats.completedBookmarks === 2;
      },
      "All bookmarks processed",
      60000,
    );

    // Verify bookmarks are in the root list
    const { data: listBookmarks } = await client.GET(
      "/lists/{listId}/bookmarks",
      {
        params: {
          path: { listId: rootList.id },
        },
      },
    );
    assert(listBookmarks);
    expect(listBookmarks.bookmarks.length).toBe(2);
  });
});
