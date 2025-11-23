import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { bookmarkTags, tagsOnBookmarks } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Tags Routes", () => {
  test<CustomTestContext>("get tag", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    const createdTag = await api.create({ name: "testTag" });

    const res = await api.get({ tagId: createdTag.id });
    expect(res.id).toEqual(createdTag.id);
    expect(res.name).toEqual("testTag");
    expect(res.numBookmarks).toBeGreaterThanOrEqual(0);
  });

  test<CustomTestContext>("get tag returns bookmark stats", async ({
    apiCallers,
  }) => {
    const tagsApi = apiCallers[0].tags;
    const bookmarksApi = apiCallers[0].bookmarks;

    const firstBookmark = await bookmarksApi.createBookmark({
      url: "https://example.com/first",
      type: BookmarkTypes.LINK,
    });
    const secondBookmark = await bookmarksApi.createBookmark({
      url: "https://example.com/second",
      type: BookmarkTypes.LINK,
    });

    const firstAttachment = await bookmarksApi.updateTags({
      bookmarkId: firstBookmark.id,
      attach: [{ tagName: "stats-tag" }],
      detach: [],
    });

    const tagId = firstAttachment.attached[0];

    await bookmarksApi.updateTags({
      bookmarkId: secondBookmark.id,
      attach: [{ tagId }],
      detach: [],
    });

    const stats = await tagsApi.get({ tagId });

    expect(stats.numBookmarks).toBe(2);
    expect(stats.numBookmarksByAttachedType.human).toBe(2);
    expect(stats.numBookmarksByAttachedType.ai).toBe(0);
  });

  test<CustomTestContext>("get tag - not found", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    await expect(() => api.get({ tagId: "nonExistentId" })).rejects.toThrow(
      /Tag not found/,
    );
  });

  test<CustomTestContext>("delete tag", async ({ apiCallers, db }) => {
    const api = apiCallers[0].tags;
    const createdTag = await api.create({ name: "testTag" });

    await api.delete({ tagId: createdTag.id });

    const res = await db.query.bookmarkTags.findFirst({
      where: eq(bookmarkTags.id, createdTag.id),
    });
    expect(res).toBeUndefined(); // Tag should be deleted
  });

  test<CustomTestContext>("delete tag - unauthorized", async ({
    apiCallers,
  }) => {
    const user1api = apiCallers[0].tags;
    const createdTag = await user1api.create({ name: "testTag" });

    const api = apiCallers[1].tags;
    await expect(() => api.delete({ tagId: createdTag.id })).rejects.toThrow(
      /User is not allowed to access resource/,
    );
  });

  test<CustomTestContext>("delete unused tags", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    await api.create({ name: "unusedTag" }); // Create an unused tag

    const res = await api.deleteUnused();
    expect(res.deletedTags).toBeGreaterThanOrEqual(1); // At least one tag deleted
  });

  test<CustomTestContext>("update tag", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    const createdTag = await api.create({ name: "oldName" });

    const updatedTag = await api.update({
      tagId: createdTag.id,
      name: "newName",
    });
    expect(updatedTag.name).toEqual("newName");
  });

  test<CustomTestContext>("update tag - conflict", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    await api.create({ name: "existingName" });
    const createdTag = await api.create({ name: "anotherName" });

    await expect(() =>
      api.update({ tagId: createdTag.id, name: "existingName" }),
    ).rejects.toThrow(/Tag name already exists/);
  });

  test<CustomTestContext>("merge tags", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    const tag1 = await api.create({ name: "tag1" });
    const tag2 = await api.create({ name: "tag2" });

    // First, create a bookmark with tag2
    const bookmarkApi = apiCallers[0].bookmarks;
    const createdBookmark = await bookmarkApi.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });
    await bookmarkApi.updateTags({
      bookmarkId: createdBookmark.id,
      attach: [{ tagName: "tag2" }],
      detach: [],
    });

    // Now perform the merge
    const result = await api.merge({
      intoTagId: tag1.id,
      fromTagIds: [tag2.id],
    });
    expect(result.mergedIntoTagId).toEqual(tag1.id);
    expect(result.deletedTags).toContain(tag2.id);

    // Verify that the bookmark now has tag1 and not tag2
    const updatedBookmark = await bookmarkApi.getBookmark({
      bookmarkId: createdBookmark.id,
      includeContent: false,
    });
    const tagNames = updatedBookmark.tags.map((tag) => tag.name);
    expect(tagNames).toContain("tag1");
    expect(tagNames).not.toContain("tag2");
  });

  test<CustomTestContext>("merge tags - invalid input", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].tags;
    await expect(() =>
      api.merge({ intoTagId: "tag1", fromTagIds: ["tag1"] }),
    ).rejects.toThrow(/Cannot merge tag into itself/);
  });

  describe("list tags", () => {
    test<CustomTestContext>("basic list", async ({ apiCallers }) => {
      const api = apiCallers[0].tags;
      await api.create({ name: "tag1" });
      await api.create({ name: "tag2" });

      const res = await api.list();
      expect(res.tags.length).toBeGreaterThanOrEqual(2);
      expect(res.tags.some((tag) => tag.name === "tag1")).toBeTruthy();
      expect(res.tags.some((tag) => tag.name === "tag2")).toBeTruthy();
    });

    test<CustomTestContext>("includes bookmark stats", async ({
      apiCallers,
    }) => {
      const tagsApi = apiCallers[0].tags;
      const bookmarksApi = apiCallers[0].bookmarks;

      const firstBookmark = await bookmarksApi.createBookmark({
        url: "https://example.com/list-first",
        type: BookmarkTypes.LINK,
      });
      const secondBookmark = await bookmarksApi.createBookmark({
        url: "https://example.com/list-second",
        type: BookmarkTypes.LINK,
      });

      const firstAttachment = await bookmarksApi.updateTags({
        bookmarkId: firstBookmark.id,
        attach: [{ tagName: "list-stats-tag" }],
        detach: [],
      });

      const tagId = firstAttachment.attached[0];

      await bookmarksApi.updateTags({
        bookmarkId: secondBookmark.id,
        attach: [{ tagId }],
        detach: [],
      });

      const list = await tagsApi.list();
      const tagStats = list.tags.find((tag) => tag.id === tagId);

      expect(tagStats).toBeDefined();
      expect(tagStats!.numBookmarks).toBe(2);
      expect(tagStats!.numBookmarksByAttachedType.human).toBe(2);
      expect(tagStats!.numBookmarksByAttachedType.ai).toBe(0);
    });

    test<CustomTestContext>("privacy", async ({ apiCallers }) => {
      const apiUser1 = apiCallers[0].tags;
      await apiUser1.create({ name: "user1Tag" });

      const apiUser2 = apiCallers[1].tags; // Different user
      const resUser2 = await apiUser2.list();
      expect(resUser2.tags.some((tag) => tag.name === "user1Tag")).toBeFalsy(); // Should not see other user's tags
    });

    test<CustomTestContext>("search by name", async ({ apiCallers }) => {
      const api = apiCallers[0].tags;

      await api.create({ name: "alpha" });
      await api.create({ name: "beta" });
      await api.create({ name: "alph2" });

      {
        const res = await api.list({ nameContains: "al" });
        expect(res.tags.length).toBe(2);
        expect(res.tags.some((tag) => tag.name === "alpha")).toBeTruthy();
        expect(res.tags.some((tag) => tag.name === "beta")).not.toBeTruthy();
        expect(res.tags.some((tag) => tag.name === "alph2")).toBeTruthy();
      }

      {
        const res = await api.list({ nameContains: "beta" });
        expect(res.tags.length).toBe(1);
        expect(res.tags.some((tag) => tag.name === "beta")).toBeTruthy();
      }

      {
        const res = await api.list({});
        expect(res.tags.length).toBe(3);
      }
    });

    describe("pagination", () => {
      test<CustomTestContext>("basic limit and cursor", async ({
        apiCallers,
      }) => {
        const api = apiCallers[0].tags;

        // Create several tags
        await api.create({ name: "tag1" });
        await api.create({ name: "tag2" });
        await api.create({ name: "tag3" });
        await api.create({ name: "tag4" });
        await api.create({ name: "tag5" });

        // Test first page with limit
        const firstPage = await api.list({
          limit: 2,
          cursor: { page: 0 },
        });
        expect(firstPage.tags.length).toBe(2);
        expect(firstPage.nextCursor).not.toBeNull();

        // Test second page
        const secondPage = await api.list({
          limit: 2,
          cursor: firstPage.nextCursor!,
        });
        expect(secondPage.tags.length).toBe(2);
        expect(secondPage.nextCursor).not.toBeNull();

        // Test third page (last page)
        const thirdPage = await api.list({
          limit: 2,
          cursor: { page: 2 },
        });
        expect(thirdPage.tags.length).toBe(1);
        expect(thirdPage.nextCursor).toBeNull();
      });

      test<CustomTestContext>("no limit returns all tags", async ({
        apiCallers,
      }) => {
        const api = apiCallers[0].tags;

        await api.create({ name: "tag1" });
        await api.create({ name: "tag2" });
        await api.create({ name: "tag3" });

        const res = await api.list({});
        expect(res.tags.length).toBe(3);
        expect(res.nextCursor).toBeNull();
      });

      test<CustomTestContext>("empty page", async ({ apiCallers }) => {
        const api = apiCallers[0].tags;

        await api.create({ name: "tag1" });

        const emptyPage = await api.list({
          limit: 2,
          cursor: { page: 5 }, // Way beyond available data
        });
        expect(emptyPage.tags.length).toBe(0);
        expect(emptyPage.nextCursor).toBeNull();
      });

      test<CustomTestContext>("edge cases", async ({ apiCallers }) => {
        const api = apiCallers[0].tags;

        // Test pagination with no tags
        const emptyResult = await api.list({
          limit: 10,
          cursor: { page: 0 },
        });
        expect(emptyResult.tags.length).toBe(0);
        expect(emptyResult.nextCursor).toBeNull();

        // Create exactly one page worth of tags
        await api.create({ name: "tag1" });
        await api.create({ name: "tag2" });

        const exactPage = await api.list({
          limit: 2,
          cursor: { page: 0 },
        });
        expect(exactPage.tags.length).toBe(2);
        expect(exactPage.nextCursor).toBeNull();

        // Test with limit larger than available tags
        const oversizedLimit = await api.list({
          limit: 100,
          cursor: { page: 0 },
        });
        expect(oversizedLimit.tags.length).toBe(2);
        expect(oversizedLimit.nextCursor).toBeNull();
      });
    });

    describe("attachedBy filtering", () => {
      test<CustomTestContext>("human tags", async ({ apiCallers, db }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create tags attached by humans
        const bookmark = await bookmarksApi.createBookmark({
          url: "https://example.com/human",
          type: BookmarkTypes.LINK,
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark.id,
          attach: [{ tagName: "human-tag" }],
          detach: [],
        });

        // Create an unused tag (no attachments)
        await tagsApi.create({ name: "unused-tag" });

        const aiTag = await tagsApi.create({ name: "ai-tag" });
        await db.insert(tagsOnBookmarks).values([
          {
            bookmarkId: bookmark.id,
            tagId: aiTag.id,
            attachedBy: "ai",
          },
        ]);

        const humanTags = await tagsApi.list({ attachedBy: "human" });
        expect(humanTags.tags.length).toBe(1);
        expect(humanTags.tags[0].name).toBe("human-tag");
      });

      test<CustomTestContext>("none (unused tags)", async ({ apiCallers }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create a used tag
        const bookmark = await bookmarksApi.createBookmark({
          url: "https://example.com/used",
          type: BookmarkTypes.LINK,
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark.id,
          attach: [{ tagName: "used-tag" }],
          detach: [],
        });

        // Create unused tags
        await tagsApi.create({ name: "unused-tag-1" });
        await tagsApi.create({ name: "unused-tag-2" });

        const unusedTags = await tagsApi.list({ attachedBy: "none" });
        expect(unusedTags.tags.length).toBe(2);

        const tagNames = unusedTags.tags.map((tag) => tag.name);
        expect(tagNames).toContain("unused-tag-1");
        expect(tagNames).toContain("unused-tag-2");
        expect(tagNames).not.toContain("used-tag");
      });

      test<CustomTestContext>("ai tags", async ({ apiCallers, db }) => {
        const bookmarksApi = apiCallers[0].bookmarks;
        const tagsApi = apiCallers[0].tags;

        const tag1 = await tagsApi.create({ name: "ai-tag" });
        const tag2 = await tagsApi.create({ name: "human-tag" });

        // Create bookmarks and attach tags to give them usage
        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/z",
          type: BookmarkTypes.LINK,
        });

        // Manually attach some tags
        await db.insert(tagsOnBookmarks).values([
          {
            bookmarkId: bookmark1.id,
            tagId: tag1.id,
            attachedBy: "ai",
          },
          {
            bookmarkId: bookmark1.id,
            tagId: tag2.id,
            attachedBy: "human",
          },
        ]);

        const aiTags = await tagsApi.list({ attachedBy: "ai" });
        expect(aiTags.tags.length).toBe(1);
        expect(aiTags.tags[0].name).toBe("ai-tag");
      });
    });

    describe("sortBy", () => {
      test<CustomTestContext>("name sorting", async ({ apiCallers }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create bookmarks and attach tags to give them usage
        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/z",
          type: BookmarkTypes.LINK,
        });
        const bookmark2 = await bookmarksApi.createBookmark({
          url: "https://example.com/a",
          type: BookmarkTypes.LINK,
        });
        const bookmark3 = await bookmarksApi.createBookmark({
          url: "https://example.com/m",
          type: BookmarkTypes.LINK,
        });

        // Attach tags in order: zebra (1 use), apple (2 uses), middle (1 use)
        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [{ tagName: "zebra" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark2.id,
          attach: [{ tagName: "apple" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark3.id,
          attach: [{ tagName: "apple" }, { tagName: "middle" }],
          detach: [],
        });

        // Test sorting by name (alphabetical)
        const nameSort = await tagsApi.list({ sortBy: "name" });
        expect(nameSort.tags.length).toBe(3);
        expect(nameSort.tags[0].name).toBe("apple");
        expect(nameSort.tags[1].name).toBe("middle");
        expect(nameSort.tags[2].name).toBe("zebra");
      });

      test<CustomTestContext>("usage sorting (default)", async ({
        apiCallers,
      }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create bookmarks and attach tags with different usage counts
        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/usage1",
          type: BookmarkTypes.LINK,
        });
        const bookmark2 = await bookmarksApi.createBookmark({
          url: "https://example.com/usage2",
          type: BookmarkTypes.LINK,
        });
        const bookmark3 = await bookmarksApi.createBookmark({
          url: "https://example.com/usage3",
          type: BookmarkTypes.LINK,
        });

        // single-use: 1 bookmark, high-use: 3 bookmarks, medium-use: 2 bookmarks
        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [{ tagName: "high-use" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark2.id,
          attach: [{ tagName: "high-use" }, { tagName: "medium-use" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark3.id,
          attach: [
            { tagName: "high-use" },
            { tagName: "medium-use" },
            { tagName: "single-use" },
          ],
          detach: [],
        });

        // Test default sorting (usage) and explicit usage sorting
        const defaultSort = await tagsApi.list({});
        expect(defaultSort.tags.length).toBe(3);
        expect(defaultSort.tags[0].name).toBe("high-use");
        expect(defaultSort.tags[0].numBookmarks).toBe(3);
        expect(defaultSort.tags[1].name).toBe("medium-use");
        expect(defaultSort.tags[1].numBookmarks).toBe(2);
        expect(defaultSort.tags[2].name).toBe("single-use");
        expect(defaultSort.tags[2].numBookmarks).toBe(1);

        const usageSort = await tagsApi.list({ sortBy: "usage" });
        expect(usageSort.tags[0].name).toBe("high-use");
        expect(usageSort.tags[1].name).toBe("medium-use");
        expect(usageSort.tags[2].name).toBe("single-use");
      });

      test<CustomTestContext>("relevance sorting", async ({ apiCallers }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create bookmarks to give tags usage
        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/rel1",
          type: BookmarkTypes.LINK,
        });

        // Create tags with different relevance to search term "java"
        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [
            { tagName: "java" }, // Exact match - highest relevance
            { tagName: "javascript" }, // Prefix match
            { tagName: "java-script" }, // Prefix match (shorter)
            { tagName: "advanced-java" }, // Substring match
          ],
          detach: [],
        });

        // Test relevance sorting
        const relevanceSort = await tagsApi.list({
          nameContains: "java",
          sortBy: "relevance",
        });

        expect(relevanceSort.tags.length).toBe(4);

        // Exact match should be first
        expect(relevanceSort.tags[0].name).toBe("java");

        // Prefix matches should come next, shorter first (by length)
        expect(relevanceSort.tags[1].name).toBe("javascript"); // length 10
        expect(relevanceSort.tags[2].name).toBe("java-script"); // length 11

        // Substring matches should be last
        expect(relevanceSort.tags[3].name).toBe("advanced-java");
      });

      test<CustomTestContext>("relevance sorting case insensitive", async ({
        apiCallers,
      }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/case",
          type: BookmarkTypes.LINK,
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [
            { tagName: "React" }, // Exact match (different case)
            { tagName: "ReactJS" }, // Prefix match
            { tagName: "my-react" }, // Substring match
          ],
          detach: [],
        });

        const relevanceSort = await tagsApi.list({
          nameContains: "react",
          sortBy: "relevance",
        });

        expect(relevanceSort.tags.length).toBe(3);
        expect(relevanceSort.tags[0].name).toBe("React"); // Exact match first
        expect(relevanceSort.tags[1].name).toBe("ReactJS"); // Prefix match second
        expect(relevanceSort.tags[2].name).toBe("my-react"); // Substring match last
      });

      test<CustomTestContext>("relevance sorting without search term is prevented by validation", async ({
        apiCallers,
      }) => {
        const tagsApi = apiCallers[0].tags;

        // Without nameContains, relevance sorting should throw validation error
        await expect(() =>
          tagsApi.list({ sortBy: "relevance" }),
        ).rejects.toThrow(/Relevance sorting requires a nameContains filter/);
      });
    });

    describe("combination filtering", () => {
      test<CustomTestContext>("nameContains with attachedBy", async ({
        apiCallers,
      }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create bookmarks with tags
        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/combo1",
          type: BookmarkTypes.LINK,
        });
        const bookmark2 = await bookmarksApi.createBookmark({
          url: "https://example.com/combo2",
          type: BookmarkTypes.LINK,
        });

        // Attach human tags with "test" in name
        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [{ tagName: "test-human" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark2.id,
          attach: [{ tagName: "test-used" }],
          detach: [],
        });

        // Create unused tag with "test" in name
        await tagsApi.create({ name: "test-unused" });

        // Create used tag without "test" in name
        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [{ tagName: "other-human" }],
          detach: [],
        });

        // Test combination: nameContains + attachedBy human
        const humanTestTags = await tagsApi.list({
          nameContains: "test",
          attachedBy: "human",
        });
        expect(humanTestTags.tags.length).toBe(2);

        const humanTestNames = humanTestTags.tags.map((tag) => tag.name);
        expect(humanTestNames).toContain("test-human");
        expect(humanTestNames).toContain("test-used");
        expect(humanTestNames).not.toContain("test-unused");
        expect(humanTestNames).not.toContain("other-human");

        // Test combination: nameContains + attachedBy none
        const unusedTestTags = await tagsApi.list({
          nameContains: "test",
          attachedBy: "none",
        });
        expect(unusedTestTags.tags.length).toBe(1);
        expect(unusedTestTags.tags[0].name).toBe("test-unused");
      });

      test<CustomTestContext>("all parameters together", async ({
        apiCallers,
      }) => {
        const tagsApi = apiCallers[0].tags;
        const bookmarksApi = apiCallers[0].bookmarks;

        // Create multiple bookmarks with various tags
        const bookmark1 = await bookmarksApi.createBookmark({
          url: "https://example.com/all1",
          type: BookmarkTypes.LINK,
        });
        const bookmark2 = await bookmarksApi.createBookmark({
          url: "https://example.com/all2",
          type: BookmarkTypes.LINK,
        });
        const bookmark3 = await bookmarksApi.createBookmark({
          url: "https://example.com/all3",
          type: BookmarkTypes.LINK,
        });

        // Create tags with different usage patterns
        await bookmarksApi.updateTags({
          bookmarkId: bookmark1.id,
          attach: [{ tagName: "filter-high" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark2.id,
          attach: [{ tagName: "filter-high" }, { tagName: "filter-low" }],
          detach: [],
        });

        await bookmarksApi.updateTags({
          bookmarkId: bookmark3.id,
          attach: [{ tagName: "filter-high" }],
          detach: [],
        });

        // Test all parameters: nameContains + attachedBy + sortBy + pagination
        const result = await tagsApi.list({
          nameContains: "filter",
          attachedBy: "human",
          sortBy: "usage",
          limit: 1,
          cursor: { page: 0 },
        });

        expect(result.tags.length).toBe(1);
        expect(result.tags[0].name).toBe("filter-high"); // Highest usage
        expect(result.tags[0].numBookmarks).toBe(3);
        expect(result.nextCursor).not.toBeNull();

        // Get second page
        const secondPage = await tagsApi.list({
          nameContains: "filter",
          attachedBy: "human",
          sortBy: "usage",
          limit: 1,
          cursor: result.nextCursor!,
        });

        expect(secondPage.tags.length).toBe(1);
        expect(secondPage.tags[0].name).toBe("filter-low"); // Lower usage
        expect(secondPage.tags[0].numBookmarks).toBe(1);
        expect(secondPage.nextCursor).toBeNull();
      });
    });
  });

  test<CustomTestContext>("create strips extra leading hashes", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0].tags;

    const created = await api.create({ name: "##demo" });
    expect(created.name).toBe("demo");

    // Confirm DB row too
    const row = await db.query.bookmarkTags.findFirst({
      where: eq(bookmarkTags.id, created.id),
    });
    expect(row?.name).toBe("demo");
  });

  test<CustomTestContext>("update normalizes leading hashes", async ({
    apiCallers,
    db,
  }) => {
    const api = apiCallers[0].tags;

    const created = await api.create({ name: "#foo" });
    const updated = await api.update({ tagId: created.id, name: "##bar" });

    expect(updated.name).toBe("bar");

    // Confirm DB row too
    const row = await db.query.bookmarkTags.findFirst({
      where: eq(bookmarkTags.id, updated.id),
    });
    expect(row?.name).toBe("bar");
  });
});
