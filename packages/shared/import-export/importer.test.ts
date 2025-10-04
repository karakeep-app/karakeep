import { describe, expect, it, vi } from "vitest";

import { importBookmarksFromFile, ParsedBookmark } from ".";

const fakeFile = {
  text: vi.fn().mockResolvedValue("fake file content"),
} as unknown as File;

describe("importBookmarksFromFile", () => {
  it("creates root list, folders and imports bookmarks with progress", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue([
        {
          title: "GitHub Repository",
          content: { type: "link", url: "https://github.com/example/repo" },
          tags: ["dev", "github"],
          addDate: 100,
          paths: [["Development", "Projects"]],
        },
        {
          title: "My Notes",
          content: { type: "text", text: "Important notes about the project" },
          tags: ["notes"],
          addDate: 200,
          paths: [["Personal"]],
          notes: "Additional context",
          archived: true,
        },
        {
          title: "Blog Post",
          content: { type: "link", url: "https://example.com/blog" },
          tags: ["reading", "tech"],
          addDate: 300,
          paths: [["Reading", "Tech"]],
        },
        {
          title: "No Category Item",
          content: { type: "link", url: "https://example.com/misc" },
          tags: [],
          addDate: 400,
          paths: [],
        },
        {
          title: "Duplicate URL Test",
          content: { type: "link", url: "https://github.com/example/repo" },
          tags: ["duplicate"],
          addDate: 50, // Earlier date
          paths: [["Development", "Duplicates"]],
        },
      ]),
    };

    const createdLists: { name: string; icon: string; parentId?: string }[] =
      [];
    const createList = vi.fn(
      async (input: { name: string; icon: string; parentId?: string }) => {
        createdLists.push(input);
        return {
          id: `${input.parentId ? input.parentId + "/" : ""}${input.name}`,
        };
      },
    );

    const createdBookmarks: ParsedBookmark[] = [];
    const addedToLists: { bookmarkId: string; listIds: string[] }[] = [];
    const updatedTags: { bookmarkId: string; tags: string[] }[] = [];

    const createBookmark = vi.fn(async (bookmark: ParsedBookmark) => {
      createdBookmarks.push(bookmark);
      return {
        id: `bookmark-${createdBookmarks.length}`,
        alreadyExists: false,
      };
    });

    const addBookmarkToLists = vi.fn(
      async (input: { bookmarkId: string; listIds: string[] }) => {
        addedToLists.push(input);
      },
    );

    const updateBookmarkTags = vi.fn(
      async (input: { bookmarkId: string; tags: string[] }) => {
        updatedTags.push(input);
      },
    );

    const createImportSession = vi.fn(async () => ({ id: "session-1" }));

    const progress: number[] = [];
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          createBookmark,
          addBookmarkToLists,
          updateBookmarkTags,
          createImportSession,
        },
        onProgress: (d, t) => progress.push(d / t),
      },
      { parsers },
    );

    expect(res.rootListId).toBe("Imported");
    expect(res.counts).toEqual({
      successes: 5,
      failures: 0,
      alreadyExisted: 0,
      total: 5, // Using custom parser, no deduplication
    });
    // Root + all unique folders from paths
    expect(createdLists).toEqual([
      { name: "Imported", icon: "⬆️" },
      { name: "Development", parentId: "Imported", icon: "📁" },
      { name: "Personal", parentId: "Imported", icon: "📁" },
      { name: "Reading", parentId: "Imported", icon: "📁" },
      { name: "Projects", parentId: "Imported/Development", icon: "📁" },
      { name: "Tech", parentId: "Imported/Reading", icon: "📁" },
      { name: "Duplicates", parentId: "Imported/Development", icon: "📁" },
    ]);
    // Verify we have 5 created bookmarks (no deduplication with custom parser)
    expect(createdBookmarks).toHaveLength(5);
    // Verify GitHub bookmark exists (will be two separate bookmarks since no deduplication)
    const githubBookmarks = createdBookmarks.filter(
      (bookmark) =>
        bookmark.content?.type === "link" &&
        bookmark.content.url === "https://github.com/example/repo",
    );
    expect(githubBookmarks).toHaveLength(2);
    // Verify text bookmark exists
    const textBookmark = createdBookmarks.find(
      (bookmark) => bookmark.content?.type === "text",
    );
    expect(textBookmark).toBeDefined();
    expect(textBookmark!.archived).toBe(true);
    expect(textBookmark!.notes).toBe("Additional context");
    // Verify bookmark with no path goes to root
    const noCategoryBookmark = createdBookmarks.find(
      (bookmark) =>
        bookmark.content?.type === "link" &&
        bookmark.content.url === "https://example.com/misc",
    );
    expect(noCategoryBookmark).toBeDefined();
    // Find the corresponding list assignment for this bookmark
    const noCategoryBookmarkId = `bookmark-${createdBookmarks.indexOf(noCategoryBookmark!) + 1}`;
    const listAssignment = addedToLists.find(
      (a) => a.bookmarkId === noCategoryBookmarkId,
    );
    expect(listAssignment!.listIds).toEqual(["Imported"]);

    // Verify that tags were updated for bookmarks that have tags
    expect(updatedTags.length).toBeGreaterThan(0);
    expect(progress).toContain(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("returns zero counts and null rootListId when no bookmarks", async () => {
    const parsers = { html: vi.fn().mockReturnValue([]) };
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "html",
        rootListName: "Imported",
        deps: {
          createList: vi.fn(),
          createBookmark: vi.fn(),
          addBookmarkToLists: vi.fn(),
          updateBookmarkTags: vi.fn(),
          createImportSession: vi.fn(async () => ({ id: "session-1" })),
        },
      },
      { parsers },
    );
    expect(res).toEqual({
      counts: { successes: 0, failures: 0, alreadyExisted: 0, total: 0 },
      rootListId: null,
      importSessionId: null,
    });
  });

  it("continues import when individual bookmarks fail", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue([
        {
          title: "Success Bookmark 1",
          content: { type: "link", url: "https://example.com/success1" },
          tags: ["success"],
          addDate: 100,
          paths: [["Success"]],
        },
        {
          title: "Failure Bookmark",
          content: { type: "link", url: "https://example.com/failure" },
          tags: ["failure"],
          addDate: 200,
          paths: [["Failure"]],
        },
        {
          title: "Success Bookmark 2",
          content: { type: "link", url: "https://example.com/success2" },
          tags: ["success"],
          addDate: 300,
          paths: [["Success"]],
        },
      ]),
    };

    const createdLists: { name: string; icon: string; parentId?: string }[] =
      [];
    const createList = vi.fn(
      async (input: { name: string; icon: string; parentId?: string }) => {
        createdLists.push(input);
        return {
          id: `${input.parentId ? input.parentId + "/" : ""}${input.name}`,
        };
      },
    );

    const createdBookmarks: ParsedBookmark[] = [];
    const addedToLists: { bookmarkId: string; listIds: string[] }[] = [];
    const updatedTags: { bookmarkId: string; tags: string[] }[] = [];

    const createBookmark = vi.fn(async (bookmark: ParsedBookmark) => {
      // Simulate failure for the "Failure Bookmark"
      if (bookmark.title === "Failure Bookmark") {
        throw new Error("Simulated bookmark creation failure");
      }

      createdBookmarks.push(bookmark);
      return {
        id: `bookmark-${createdBookmarks.length}`,
        alreadyExists: false,
      };
    });

    const addBookmarkToLists = vi.fn(
      async (input: { bookmarkId: string; listIds: string[] }) => {
        addedToLists.push(input);
      },
    );

    const updateBookmarkTags = vi.fn(
      async (input: { bookmarkId: string; tags: string[] }) => {
        updatedTags.push(input);
      },
    );

    const createImportSession = vi.fn(async () => ({ id: "session-1" }));

    const progress: number[] = [];
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          createBookmark,
          addBookmarkToLists,
          updateBookmarkTags,
          createImportSession,
        },
        onProgress: (d, t) => progress.push(d / t),
      },
      { parsers },
    );

    // Should still create the root list
    expect(res.rootListId).toBe("Imported");

    // Should track both successes and failures
    expect(res.counts).toEqual({
      successes: 2, // Two successful bookmarks
      failures: 1, // One failed bookmark
      alreadyExisted: 0,
      total: 3,
    });

    // Should create folders for all bookmarks (including failed ones)
    expect(createdLists).toEqual([
      { name: "Imported", icon: "⬆️" },
      { name: "Success", parentId: "Imported", icon: "📁" },
      { name: "Failure", parentId: "Imported", icon: "📁" },
    ]);

    // Only successful bookmarks should be created
    expect(createdBookmarks).toHaveLength(2);
    expect(createdBookmarks.map((b) => b.title)).toEqual([
      "Success Bookmark 1",
      "Success Bookmark 2",
    ]);

    // Only successful bookmarks should be added to lists and have tags updated
    expect(addedToLists).toHaveLength(2);
    expect(updatedTags).toHaveLength(2);

    // Progress should complete even with failures
    expect(progress).toContain(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("handles failures in different stages of bookmark import", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue([
        {
          title: "Success Bookmark",
          content: { type: "link", url: "https://example.com/success" },
          tags: ["success"],
          addDate: 100,
          paths: [["Success"]],
        },
        {
          title: "Fail at List Assignment",
          content: { type: "link", url: "https://example.com/fail-list" },
          tags: ["fail"],
          addDate: 200,
          paths: [["Failure"]],
        },
        {
          title: "Fail at Tag Update",
          content: { type: "link", url: "https://example.com/fail-tag" },
          tags: ["fail-tag"],
          addDate: 300,
          paths: [["Failure"]],
        },
      ]),
    };

    const createList = vi.fn(
      async (input: { name: string; icon: string; parentId?: string }) => {
        return {
          id: `${input.parentId ? input.parentId + "/" : ""}${input.name}`,
        };
      },
    );

    let bookmarkIdCounter = 1;
    const createBookmark = vi.fn(async () => {
      return { id: `bookmark-${bookmarkIdCounter++}`, alreadyExists: false };
    });

    const addBookmarkToLists = vi.fn(
      async (input: { bookmarkId: string; listIds: string[] }) => {
        // Simulate failure for specific bookmark
        if (input.bookmarkId === "bookmark-2") {
          throw new Error("Failed to add bookmark to lists");
        }
      },
    );

    const updateBookmarkTags = vi.fn(
      async (input: { bookmarkId: string; tags: string[] }) => {
        // Simulate failure for specific bookmark
        if (input.bookmarkId === "bookmark-3") {
          throw new Error("Failed to update bookmark tags");
        }
      },
    );

    const createImportSession = vi.fn(async () => ({ id: "session-1" }));

    const progress: number[] = [];
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          createBookmark,
          addBookmarkToLists,
          updateBookmarkTags,
          createImportSession,
        },
        onProgress: (d, t) => progress.push(d / t),
      },
      { parsers },
    );

    expect(res.rootListId).toBe("Imported");
    expect(res.importSessionId).toBe("session-1");

    // All bookmarks are created successfully, but 2 fail in post-processing
    expect(res.counts).toEqual({
      successes: 1, // Only one fully successful bookmark
      failures: 2, // Two failed in post-processing steps
      alreadyExisted: 0,
      total: 3,
    });

    // All bookmarks should be created (failures happen after bookmark creation)
    expect(createBookmark).toHaveBeenCalledTimes(3);

    // addBookmarkToLists should be called 3 times (but one fails)
    expect(addBookmarkToLists).toHaveBeenCalledTimes(3);

    // updateBookmarkTags should be called 2 times (once fails at list assignment, one fails at tag update)
    expect(updateBookmarkTags).toHaveBeenCalledTimes(2);
  });
});
