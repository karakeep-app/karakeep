import { describe, expect, it, vi } from "vitest";

import type { StagedBookmark } from ".";
import { importBookmarksFromFile } from ".";

const fakeFile = {
  text: vi.fn().mockResolvedValue("fake file content"),
} as unknown as File;

describe("importBookmarksFromFile", () => {
  it("creates root list, folders and stages bookmarks with progress", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue({
        bookmarks: [
          {
            title: "GitHub Repository",
            content: { type: "link", url: "https://github.com/example/repo" },
            tags: ["dev", "github"],
            addDate: 100,
            paths: [["Development", "Projects"]],
          },
          {
            title: "My Notes",
            content: {
              type: "text",
              text: "Important notes about the project",
            },
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
        ],
        lists: [],
      }),
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

    const stagedBookmarks: StagedBookmark[] = [];
    const stageImportedBookmarks = vi.fn(
      async (input: {
        importSessionId: string;
        bookmarks: StagedBookmark[];
      }) => {
        stagedBookmarks.push(...input.bookmarks);
      },
    );

    const finalizeImportStaging = vi.fn();
    const createImportSession = vi.fn(
      async (_input: { name: string; rootListId: string }) => ({
        id: "session-1",
      }),
    );

    const progress: number[] = [];
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          stageImportedBookmarks,
          finalizeImportStaging,
          createImportSession,
        },
        onProgress: (d, t) => progress.push(d / t),
      },
      { parsers },
    );

    expect(res.rootListId).toBe("Imported");
    expect(res.importSessionId).toBe("session-1");
    expect(res.counts).toEqual({
      successes: 0,
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

    // Verify 5 bookmarks were staged (in 1 batch since < 50)
    expect(stagedBookmarks).toHaveLength(5);
    expect(stageImportedBookmarks).toHaveBeenCalledTimes(1);

    // Verify GitHub link bookmark was staged correctly
    const githubBookmark = stagedBookmarks.find(
      (b) => b.url === "https://github.com/example/repo" && b.type === "link",
    );
    expect(githubBookmark).toBeDefined();
    if (!githubBookmark) {
      throw new Error("Expected GitHub bookmark to be staged");
    }
    expect(githubBookmark.title).toBe("GitHub Repository");
    expect(githubBookmark.tags).toEqual(["dev", "github"]);
    expect(githubBookmark.listIds).toEqual(["Imported/Development/Projects"]);

    // Verify text bookmark was staged correctly
    const textBookmark = stagedBookmarks.find((b) => b.type === "text");
    expect(textBookmark).toBeDefined();
    if (!textBookmark) {
      throw new Error("Expected text bookmark to be staged");
    }
    expect(textBookmark.content).toBe("Important notes about the project");
    expect(textBookmark.note).toBe("Additional context");
    expect(textBookmark.listIds).toEqual(["Imported/Personal"]);

    // Verify bookmark with empty paths gets root list ID
    const noCategoryBookmark = stagedBookmarks.find(
      (b) => b.url === "https://example.com/misc",
    );
    expect(noCategoryBookmark).toBeDefined();
    expect(noCategoryBookmark!.listIds).toEqual(["Imported"]);

    // Verify finalizeImportStaging was called
    expect(finalizeImportStaging).toHaveBeenCalledWith("session-1");

    expect(progress).toContain(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("returns zero counts and null rootListId when no bookmarks", async () => {
    const parsers = {
      html: vi.fn().mockReturnValue({ bookmarks: [], lists: [] }),
    };
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "html",
        rootListName: "Imported",
        deps: {
          createList: vi.fn(),
          stageImportedBookmarks: vi.fn(),
          finalizeImportStaging: vi.fn(),
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

  it("stages all bookmarks successfully", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue({
        bookmarks: [
          {
            title: "Bookmark 1",
            content: { type: "link", url: "https://example.com/1" },
            tags: ["tag1"],
            addDate: 100,
            paths: [["Category1"]],
          },
          {
            title: "Bookmark 2",
            content: { type: "link", url: "https://example.com/2" },
            tags: ["tag2"],
            addDate: 200,
            paths: [["Category2"]],
          },
          {
            title: "Bookmark 3",
            content: { type: "link", url: "https://example.com/3" },
            tags: ["tag3"],
            addDate: 300,
            paths: [["Category1"]],
          },
        ],
        lists: [],
      }),
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

    const stagedBookmarks: StagedBookmark[] = [];
    const stageImportedBookmarks = vi.fn(
      async (input: {
        importSessionId: string;
        bookmarks: StagedBookmark[];
      }) => {
        stagedBookmarks.push(...input.bookmarks);
      },
    );

    const finalizeImportStaging = vi.fn();
    const createImportSession = vi.fn(
      async (_input: { name: string; rootListId: string }) => ({
        id: "session-1",
      }),
    );

    const progress: number[] = [];
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          stageImportedBookmarks,
          finalizeImportStaging,
          createImportSession,
        },
        onProgress: (d, t) => progress.push(d / t),
      },
      { parsers },
    );

    expect(res.rootListId).toBe("Imported");
    expect(res.importSessionId).toBe("session-1");
    expect(res.counts).toEqual({
      successes: 0,
      failures: 0,
      alreadyExisted: 0,
      total: 3,
    });

    // Should create folders for all bookmarks
    expect(createdLists).toEqual([
      { name: "Imported", icon: "⬆️" },
      { name: "Category1", parentId: "Imported", icon: "📁" },
      { name: "Category2", parentId: "Imported", icon: "📁" },
    ]);

    // All bookmarks should be staged (in 1 batch since < 50)
    expect(stagedBookmarks).toHaveLength(3);
    expect(stageImportedBookmarks).toHaveBeenCalledTimes(1);

    // Verify finalizeImportStaging was called
    expect(finalizeImportStaging).toHaveBeenCalledWith("session-1");

    // Progress should complete
    expect(progress).toContain(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("stages bookmarks with different paths", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue({
        bookmarks: [
          {
            title: "Bookmark 1",
            content: { type: "link", url: "https://example.com/1" },
            tags: ["tag1"],
            addDate: 100,
            paths: [["Path1"]],
          },
          {
            title: "Bookmark 2",
            content: { type: "link", url: "https://example.com/2" },
            tags: ["tag2"],
            addDate: 200,
            paths: [["Path2"]],
          },
          {
            title: "Bookmark 3",
            content: { type: "link", url: "https://example.com/3" },
            tags: ["tag3"],
            addDate: 300,
            paths: [["Path2"]],
          },
        ],
        lists: [],
      }),
    };

    const createList = vi.fn(
      async (input: { name: string; icon: string; parentId?: string }) => {
        return {
          id: `${input.parentId ? input.parentId + "/" : ""}${input.name}`,
        };
      },
    );

    const stagedBookmarks: StagedBookmark[] = [];
    const stageImportedBookmarks = vi.fn(
      async (input: {
        importSessionId: string;
        bookmarks: StagedBookmark[];
      }) => {
        stagedBookmarks.push(...input.bookmarks);
      },
    );

    const finalizeImportStaging = vi.fn();
    const createImportSession = vi.fn(
      async (_input: { name: string; rootListId: string }) => ({
        id: "session-1",
      }),
    );

    const progress: number[] = [];
    const res = await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          stageImportedBookmarks,
          finalizeImportStaging,
          createImportSession,
        },
        onProgress: (d, t) => progress.push(d / t),
      },
      { parsers },
    );

    expect(res.rootListId).toBe("Imported");
    expect(res.importSessionId).toBe("session-1");
    expect(res.counts).toEqual({
      successes: 0,
      failures: 0,
      alreadyExisted: 0,
      total: 3,
    });

    // All bookmarks should be staged (in 1 batch since < 50)
    expect(stagedBookmarks).toHaveLength(3);
    expect(stageImportedBookmarks).toHaveBeenCalledTimes(1);

    // Verify finalizeImportStaging was called
    expect(finalizeImportStaging).toHaveBeenCalledWith("session-1");
  });

  it("preserves separate list memberships when external list IDs differ", async () => {
    const parsers = {
      pocket: vi.fn().mockReturnValue({
        bookmarks: [
          {
            title: "Bookmark 1",
            content: { type: "link", url: "https://example.com/1" },
            tags: [],
            addDate: 100,
            paths: [],
            listExternalIds: ["child-1-id"],
          },
          {
            title: "Bookmark 2",
            content: { type: "link", url: "https://example.com/2" },
            tags: [],
            addDate: 200,
            paths: [],
            listExternalIds: ["child-2-id"],
          },
        ],
        lists: [
          {
            externalId: "parent-id",
            name: "Projects",
            parentExternalId: null,
            type: "manual",
          },
          {
            externalId: "child-1-id",
            name: "Inbox",
            parentExternalId: "parent-id",
            type: "manual",
          },
          {
            externalId: "child-2-id",
            name: "Inbox",
            parentExternalId: "parent-id",
            type: "manual",
          },
        ],
      }),
    };

    let idCounter = 0;
    const createdLists: { id: string; name: string; parentId?: string }[] = [];
    const createList = vi.fn(
      async (input: { name: string; icon: string; parentId?: string }) => {
        const id = `list-${idCounter++}`;
        createdLists.push({ id, name: input.name, parentId: input.parentId });
        return { id };
      },
    );

    const stagedBookmarks: StagedBookmark[] = [];
    const stageImportedBookmarks = vi.fn(
      async (input: {
        importSessionId: string;
        bookmarks: StagedBookmark[];
      }) => {
        stagedBookmarks.push(...input.bookmarks);
      },
    );

    await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "pocket",
        rootListName: "Imported",
        deps: {
          createList,
          stageImportedBookmarks,
          finalizeImportStaging: vi.fn(),
          createImportSession: vi.fn(async () => ({ id: "session-1" })),
        },
      },
      { parsers },
    );

    const projectsFolder = createdLists.find(
      (list) => list.name === "Projects",
    );
    expect(projectsFolder).toBeDefined();

    const duplicateFolders = createdLists.filter(
      (list) => list.name === "Inbox" && list.parentId === projectsFolder?.id,
    );
    expect(duplicateFolders).toHaveLength(2);

    const firstBookmark = stagedBookmarks.find(
      (bookmark) => bookmark.url === "https://example.com/1",
    );
    const secondBookmark = stagedBookmarks.find(
      (bookmark) => bookmark.url === "https://example.com/2",
    );

    expect(firstBookmark).toBeDefined();
    expect(secondBookmark).toBeDefined();
    expect(firstBookmark?.listIds[0]).not.toEqual(secondBookmark?.listIds[0]);
    expect(duplicateFolders.map((list) => list.id)).toContain(
      firstBookmark?.listIds[0],
    );
    expect(duplicateFolders.map((list) => list.id)).toContain(
      secondBookmark?.listIds[0],
    );
  });

  it("creates smart lists with their queries during import", async () => {
    const parsers = {
      karakeep: vi.fn().mockReturnValue({
        bookmarks: [
          {
            title: "Bookmark 1",
            content: { type: "link", url: "https://example.com/1" },
            tags: [],
            addDate: 100,
            paths: [],
            listExternalIds: ["manual-list-id"],
          },
        ],
        lists: [
          {
            externalId: "manual-list-id",
            name: "Manual",
            icon: "⭐",
            description: "Manual list description",
            parentExternalId: null,
            type: "manual",
          },
          {
            externalId: "smart-list-id",
            name: "Smart",
            icon: "⚡",
            description: "Smart list description",
            parentExternalId: null,
            type: "smart",
            query: "tag:read-later",
          },
        ],
      }),
    };

    const createdLists: {
      name: string;
      icon: string;
      description?: string;
      parentId?: string;
      type?: "manual" | "smart";
      query?: string;
    }[] = [];

    const createList = vi.fn(
      async (input: {
        name: string;
        icon: string;
        description?: string;
        parentId?: string;
        type?: "manual" | "smart";
        query?: string;
      }) => {
        createdLists.push(input);
        return {
          id: `${input.parentId ? input.parentId + "/" : ""}${input.name}`,
        };
      },
    );

    await importBookmarksFromFile(
      {
        file: fakeFile,
        source: "karakeep",
        rootListName: "Imported",
        deps: {
          createList,
          stageImportedBookmarks: vi.fn(async () => undefined),
          finalizeImportStaging: vi.fn(),
          createImportSession: vi.fn(async () => ({ id: "session-1" })),
        },
      },
      { parsers },
    );

    expect(createdLists).toContainEqual({
      name: "Smart",
      parentId: "Imported",
      icon: "⚡",
      description: "Smart list description",
      type: "smart",
      query: "tag:read-later",
    });

    expect(createdLists).toContainEqual({
      name: "Manual",
      parentId: "Imported",
      icon: "⭐",
      description: "Manual list description",
    });
  });

  it("handles HTML bookmarks with empty folder names", async () => {
    const htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1765995928" LAST_MODIFIED="1765995928">Bluetooth Fernbedienung</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1765995928" LAST_MODIFIED="0"></H3>
        <DL><p>
            <DT><A HREF="https://www.example.com/product.html" ADD_DATE="1593444456">Example Product</A>
        </DL><p>
    </DL><p>
</DL><p>`;

    const mockFile = {
      text: vi.fn().mockResolvedValue(htmlContent),
    } as unknown as File;

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

    const stagedBookmarks: StagedBookmark[] = [];
    const stageImportedBookmarks = vi.fn(
      async (input: {
        importSessionId: string;
        bookmarks: StagedBookmark[];
      }) => {
        stagedBookmarks.push(...input.bookmarks);
      },
    );

    const finalizeImportStaging = vi.fn();
    const createImportSession = vi.fn(
      async (_input: { name: string; rootListId: string }) => ({
        id: "session-1",
      }),
    );

    const res = await importBookmarksFromFile({
      file: mockFile,
      source: "html",
      rootListName: "HTML Import",
      deps: {
        createList,
        stageImportedBookmarks,
        finalizeImportStaging,
        createImportSession,
      },
    });

    expect(res.counts).toEqual({
      successes: 0,
      failures: 0,
      alreadyExisted: 0,
      total: 1,
    });

    // Verify that the empty folder name was replaced with "Unnamed"
    expect(createdLists).toEqual([
      { name: "HTML Import", icon: "⬆️" },
      { name: "Bluetooth Fernbedienung", parentId: "HTML Import", icon: "📁" },
      {
        name: "Unnamed",
        parentId: "HTML Import/Bluetooth Fernbedienung",
        icon: "📁",
      },
    ]);

    // Verify the bookmark was staged with correct listIds
    expect(stagedBookmarks).toHaveLength(1);
    expect(stagedBookmarks[0]).toMatchObject({
      title: "Example Product",
      url: "https://www.example.com/product.html",
      type: "link",
      tags: [],
      listIds: ["HTML Import/Bluetooth Fernbedienung/Unnamed"],
    });

    // Verify finalizeImportStaging was called
    expect(finalizeImportStaging).toHaveBeenCalledWith("session-1");
  });

  it("parses mymind CSV export correctly", async () => {
    const mymindCsv = `id,type,title,url,content,note,tags,created
1pYm0O0hY4WnmKN,WebPage,mymind,https://access.mymind.com/everything,,,"Wellness,Self-Improvement,Psychology",2024-12-04T23:02:10Z
1pYm0O0hY5ltduL,WebPage,Movies / TV / Anime,https://fmhy.pages.dev/videopiracyguide,,"Free Media!","Tools,media,Entertainment",2024-12-04T23:02:32Z
1pYm0O0hY8oFq9C,Note,,,"• Critical Thinking
• Empathy",,,2024-12-04T23:05:23Z`;

    const mockFile = {
      text: vi.fn().mockResolvedValue(mymindCsv),
    } as unknown as File;

    const stagedBookmarks: StagedBookmark[] = [];
    const stageImportedBookmarks = vi.fn(
      async (input: {
        importSessionId: string;
        bookmarks: StagedBookmark[];
      }) => {
        stagedBookmarks.push(...input.bookmarks);
      },
    );

    const finalizeImportStaging = vi.fn();
    const createImportSession = vi.fn(
      async (_input: { name: string; rootListId: string }) => ({
        id: "session-1",
      }),
    );

    const res = await importBookmarksFromFile({
      file: mockFile,
      source: "mymind",
      rootListName: "mymind Import",
      deps: {
        createList: vi.fn(
          async (input: { name: string; icon: string; parentId?: string }) => ({
            id: `${input.parentId ? input.parentId + "/" : ""}${input.name}`,
          }),
        ),
        stageImportedBookmarks,
        finalizeImportStaging,
        createImportSession,
      },
    });

    expect(res.counts).toEqual({
      successes: 0,
      failures: 0,
      alreadyExisted: 0,
      total: 3,
    });

    // Verify 3 bookmarks were staged
    expect(stagedBookmarks).toHaveLength(3);

    // Verify first bookmark (WebPage with URL) - mymind has no paths, so root list
    expect(stagedBookmarks[0]).toMatchObject({
      title: "mymind",
      url: "https://access.mymind.com/everything",
      type: "link",
      tags: ["Wellness", "Self-Improvement", "Psychology"],
      listIds: ["mymind Import"],
    });
    expect(stagedBookmarks[0].sourceAddedAt).toEqual(
      new Date("2024-12-04T23:02:10Z"),
    );

    // Verify second bookmark (WebPage with note)
    expect(stagedBookmarks[1]).toMatchObject({
      title: "Movies / TV / Anime",
      url: "https://fmhy.pages.dev/videopiracyguide",
      type: "link",
      tags: ["Tools", "media", "Entertainment"],
      note: "Free Media!",
      listIds: ["mymind Import"],
    });

    // Verify third bookmark (Note with text content)
    expect(stagedBookmarks[2]).toMatchObject({
      title: "",
      content: "• Critical Thinking\n• Empathy",
      type: "text",
      tags: [],
      listIds: ["mymind Import"],
    });

    // Verify finalizeImportStaging was called
    expect(finalizeImportStaging).toHaveBeenCalledWith("session-1");
  });
});
