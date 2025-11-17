import { eq } from "drizzle-orm";
import { assert, beforeEach, describe, expect, test } from "vitest";

import {
  bookmarkLinks,
  bookmarks,
  rssFeedImportsTable,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Bookmark Routes", () => {
  async function createTestTag(api: APICallerType, tagName: string) {
    const result = await api.tags.create({ name: tagName });
    return result.id;
  }

  async function createTestFeed(
    api: APICallerType,
    feedName: string,
    feedUrl: string,
  ) {
    // Create an RSS feed and return its ID
    const feed = await api.feeds.create({
      name: feedName,
      url: feedUrl,
      enabled: true,
    });
    return feed.id;
  }

  test<CustomTestContext>("create bookmark", async ({ apiCallers }) => {
    const api = apiCallers[0].bookmarks;
    const bookmark = await api.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });

    const res = await api.getBookmark({ bookmarkId: bookmark.id });
    assert(res.content.type == BookmarkTypes.LINK);
    expect(res.content.url).toEqual("https://google.com");
    expect(res.favourited).toEqual(false);
    expect(res.archived).toEqual(false);
    expect(res.content.type).toEqual(BookmarkTypes.LINK);
  });

  test<CustomTestContext>("delete bookmark", async ({ apiCallers }) => {
    const api = apiCallers[0].bookmarks;

    // Create the bookmark
    const bookmark = await api.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });

    // It should exist
    await api.getBookmark({ bookmarkId: bookmark.id });

    // Delete it
    await api.deleteBookmark({ bookmarkId: bookmark.id });

    // It shouldn't be there anymore
    await expect(() =>
      api.getBookmark({ bookmarkId: bookmark.id }),
    ).rejects.toThrow(/Bookmark not found/);
  });

  test<CustomTestContext>("update bookmark", async ({ apiCallers }) => {
    const api = apiCallers[0].bookmarks;

    // Create the bookmark
    const bookmark = await api.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });

    await api.updateBookmark({
      bookmarkId: bookmark.id,
      archived: true,
      favourited: true,
    });

    let res = await api.getBookmark({ bookmarkId: bookmark.id });
    expect(res.archived).toBeTruthy();
    expect(res.favourited).toBeTruthy();

    // Update other common fields
    const newDate = new Date(Date.now() - 1000 * 60 * 60 * 24); // Yesterday
    newDate.setMilliseconds(0);
    await api.updateBookmark({
      bookmarkId: bookmark.id,
      title: "New Title",
      note: "Test Note",
      summary: "Test Summary",
      createdAt: newDate,
    });

    res = await api.getBookmark({ bookmarkId: bookmark.id });
    expect(res.title).toEqual("New Title");
    expect(res.note).toEqual("Test Note");
    expect(res.summary).toEqual("Test Summary");
    expect(res.createdAt).toEqual(newDate);

    // Update link-specific fields
    const linkUpdateDate = new Date(Date.now() - 1000 * 60 * 60 * 48); // 2 days ago
    linkUpdateDate.setMilliseconds(0);
    await api.updateBookmark({
      bookmarkId: bookmark.id,
      url: "https://new-google.com",
      description: "New Description",
      author: "New Author",
      publisher: "New Publisher",
      datePublished: linkUpdateDate,
      dateModified: linkUpdateDate,
    });

    res = await api.getBookmark({ bookmarkId: bookmark.id });
    assert(res.content.type === BookmarkTypes.LINK);
    expect(res.content.url).toEqual("https://new-google.com");
    expect(res.content.description).toEqual("New Description");
    expect(res.content.author).toEqual("New Author");
    expect(res.content.publisher).toEqual("New Publisher");
    expect(res.content.datePublished).toEqual(linkUpdateDate);
    expect(res.content.dateModified).toEqual(linkUpdateDate);
  });

  test<CustomTestContext>("update bookmark - non-link type error", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].bookmarks;

    // Create a TEXT bookmark
    const bookmark = await api.createBookmark({
      text: "Initial text",
      type: BookmarkTypes.TEXT,
    });

    // Attempt to update link-specific fields
    await expect(() =>
      api.updateBookmark({
        bookmarkId: bookmark.id,
        url: "https://should-fail.com", // Link-specific field
      }),
    ).rejects.toThrow(
      /Attempting to set link attributes for non-link type bookmark/,
    );
  });

  test<CustomTestContext>("list bookmarks", async ({ apiCallers, db }) => {
    const api = apiCallers[0].bookmarks;
    const emptyBookmarks = await api.getBookmarks({});
    expect(emptyBookmarks.bookmarks.length).toEqual(0);

    const bookmark1 = await api.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });

    const bookmark2 = await api.createBookmark({
      url: "https://google2.com",
      type: BookmarkTypes.LINK,
    });

    {
      const bookmarks = await api.getBookmarks({});
      expect(bookmarks.bookmarks.length).toEqual(2);
    }

    // Archive and favourite bookmark1
    await api.updateBookmark({
      bookmarkId: bookmark1.id,
      archived: true,
      favourited: true,
    });

    {
      const bookmarks = await api.getBookmarks({ archived: false });
      expect(bookmarks.bookmarks.length).toEqual(1);
      expect(bookmarks.bookmarks[0].id).toEqual(bookmark2.id);
    }

    {
      const bookmarks = await api.getBookmarks({ favourited: true });
      expect(bookmarks.bookmarks.length).toEqual(1);
      expect(bookmarks.bookmarks[0].id).toEqual(bookmark1.id);
    }

    {
      const bookmarks = await api.getBookmarks({ archived: true });
      expect(bookmarks.bookmarks.length).toEqual(1);
      expect(bookmarks.bookmarks[0].id).toEqual(bookmark1.id);
    }

    {
      const bookmarks = await api.getBookmarks({ ids: [bookmark1.id] });
      expect(bookmarks.bookmarks.length).toEqual(1);
      expect(bookmarks.bookmarks[0].id).toEqual(bookmark1.id);
    }

    // Test tagId filter
    {
      const tagId = await createTestTag(apiCallers[0], "testTag");
      await api.updateTags({
        bookmarkId: bookmark1.id,
        attach: [{ tagId }],
        detach: [],
      });
      const tagResult = await api.getBookmarks({ tagId });
      expect(tagResult.bookmarks.length).toBeGreaterThan(0);
      expect(
        tagResult.bookmarks.some((b) => b.id === bookmark1.id),
      ).toBeTruthy();
    }

    // Test rssFeedId filter
    {
      const feedId = await createTestFeed(
        apiCallers[0],
        "Test Feed",
        "https://rss-feed.com",
      );
      const rssBookmark = await api.createBookmark({
        url: "https://rss-feed.com",
        type: BookmarkTypes.LINK,
      });
      await db.insert(rssFeedImportsTable).values([
        {
          rssFeedId: feedId,
          entryId: "entry-id",
          bookmarkId: rssBookmark.id,
        },
      ]);
      const rssResult = await api.getBookmarks({ rssFeedId: feedId });
      expect(rssResult.bookmarks.length).toBeGreaterThan(0);
      expect(
        rssResult.bookmarks.some((b) => b.id === rssBookmark.id),
      ).toBeTruthy();
    }

    // Test listId filter
    {
      const list = await apiCallers[0].lists.create({
        name: "Test List",
        type: "manual",
        icon: "😂",
      });
      await apiCallers[0].lists.addToList({
        listId: list.id,
        bookmarkId: bookmark1.id,
      });
      const listResult = await api.getBookmarks({ listId: list.id });
      expect(listResult.bookmarks.length).toBeGreaterThan(0);
      expect(
        listResult.bookmarks.some((b) => b.id === bookmark1.id),
      ).toBeTruthy();
    }
  });

  test<CustomTestContext>("update tags", async ({ apiCallers }) => {
    const api = apiCallers[0].bookmarks;
    const createdBookmark = await api.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });

    await api.updateTags({
      bookmarkId: createdBookmark.id,
      attach: [
        { tagName: "tag1" },
        { tagName: "tag2" },
        { tagName: "tag3" },
        { tagName: "tag4" },
      ],
      detach: [],
    });

    let bookmark = await api.getBookmark({ bookmarkId: createdBookmark.id });
    expect(bookmark.tags.map((t) => t.name).sort()).toEqual([
      "tag1",
      "tag2",
      "tag3",
      "tag4",
    ]);

    const tag1Id = bookmark.tags.filter((t) => t.name == "tag1")[0].id;

    await api.updateTags({
      bookmarkId: bookmark.id,
      attach: [{ tagName: "tag5" }],
      detach: [{ tagId: tag1Id }, { tagName: "tag4" }],
    });

    bookmark = await api.getBookmark({ bookmarkId: bookmark.id });
    expect(bookmark.tags.map((t) => t.name).sort()).toEqual([
      "tag2",
      "tag3",
      "tag5",
    ]);

    await api.updateTags({
      bookmarkId: bookmark.id,
      attach: [{ tagId: tag1Id }, { tagName: "tag4" }],
      detach: [],
    });
    bookmark = await api.getBookmark({ bookmarkId: bookmark.id });
    expect(bookmark.tags.map((t) => t.name).sort()).toEqual([
      "tag1",
      "tag2",
      "tag3",
      "tag4",
      "tag5",
    ]);

    await expect(() =>
      api.updateTags({ bookmarkId: bookmark.id, attach: [{}], detach: [] }),
    ).rejects.toThrow(/You must provide either a tagId or a tagName/);
    await expect(() =>
      api.updateTags({ bookmarkId: bookmark.id, attach: [], detach: [{}] }),
    ).rejects.toThrow(/You must provide either a tagId or a tagName/);
    await expect(() =>
      api.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "" }],
        detach: [{}],
      }),
    ).rejects.toThrow(/You must provide either a tagId or a tagName/);
  });

  test<CustomTestContext>("update bookmark text", async ({ apiCallers }) => {
    const api = apiCallers[0].bookmarks;
    const createdBookmark = await api.createBookmark({
      text: "HELLO WORLD",
      type: BookmarkTypes.TEXT,
    });

    await api.updateBookmarkText({
      bookmarkId: createdBookmark.id,
      text: "WORLD HELLO",
    });

    const bookmark = await api.getBookmark({ bookmarkId: createdBookmark.id });
    assert(bookmark.content.type == BookmarkTypes.TEXT);
    expect(bookmark.content.text).toEqual("WORLD HELLO");
  });

  test<CustomTestContext>("privacy", async ({ apiCallers }) => {
    const user1Bookmark = await apiCallers[0].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://google.com",
    });
    const user2Bookmark = await apiCallers[1].bookmarks.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://google.com",
    });

    // All interactions with the wrong user should fail
    await expect(() =>
      apiCallers[0].bookmarks.deleteBookmark({ bookmarkId: user2Bookmark.id }),
    ).rejects.toThrow(/Bookmark not found/);
    await expect(() =>
      apiCallers[0].bookmarks.getBookmark({ bookmarkId: user2Bookmark.id }),
    ).rejects.toThrow(/Bookmark not found/);
    await expect(() =>
      apiCallers[0].bookmarks.updateBookmark({ bookmarkId: user2Bookmark.id }),
    ).rejects.toThrow(/Bookmark not found/);
    await expect(() =>
      apiCallers[0].bookmarks.updateTags({
        bookmarkId: user2Bookmark.id,
        attach: [],
        detach: [],
      }),
    ).rejects.toThrow(/Bookmark not found/);

    // Get bookmarks should only show the correct one
    expect(
      (await apiCallers[0].bookmarks.getBookmarks({})).bookmarks.map(
        (b) => b.id,
      ),
    ).toEqual([user1Bookmark.id]);
    expect(
      (await apiCallers[1].bookmarks.getBookmarks({})).bookmarks.map(
        (b) => b.id,
      ),
    ).toEqual([user2Bookmark.id]);
  });

  test<CustomTestContext>("bookmark links dedup", async ({ apiCallers }) => {
    // Two users with google in their bookmarks
    const bookmark1User1 = await apiCallers[0].bookmarks.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });
    expect(bookmark1User1.alreadyExists).toEqual(false);

    const bookmark1User2 = await apiCallers[1].bookmarks.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });
    expect(bookmark1User2.alreadyExists).toEqual(false);

    // User1 attempting to re-add google. Should return the existing bookmark
    const bookmark2User1 = await apiCallers[0].bookmarks.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });
    expect(bookmark2User1.alreadyExists).toEqual(true);
    expect(bookmark2User1.id).toEqual(bookmark1User1.id);

    // User2 attempting to re-add google. Should return the existing bookmark
    const bookmark2User2 = await apiCallers[1].bookmarks.createBookmark({
      url: "https://google.com",
      type: BookmarkTypes.LINK,
    });
    expect(bookmark2User2.alreadyExists).toEqual(true);
    expect(bookmark2User2.id).toEqual(bookmark1User2.id);

    // User1 adding google2. Should not return an existing bookmark
    const bookmark3User1 = await apiCallers[0].bookmarks.createBookmark({
      url: "https://google2.com",
      type: BookmarkTypes.LINK,
    });
    expect(bookmark3User1.alreadyExists).toEqual(false);
  });

  // Ensure that the pagination returns all the results
  test<CustomTestContext>("pagination", async ({ apiCallers, db }) => {
    const user = await apiCallers[0].users.whoami();
    let now = 100_000;

    const bookmarkWithDate = (date_ms: number) => ({
      userId: user.id,
      createdAt: new Date(date_ms),
      type: BookmarkTypes.TEXT as const,
    });

    // One normal bookmark
    const values = [bookmarkWithDate(now)];
    // 10 with a second in between
    for (let i = 0; i < 10; i++) {
      now -= 1000;
      values.push(bookmarkWithDate(now));
    }
    // Another ten but at the same second
    for (let i = 0; i < 10; i++) {
      values.push(bookmarkWithDate(now));
    }
    // And then another one with a second afterwards
    for (let i = 0; i < 10; i++) {
      now -= 1000;
      values.push(bookmarkWithDate(now));
    }
    // In total, we should have 31 bookmarks

    const inserted = await db.insert(bookmarks).values(values).returning();

    const validateWithLimit = async (limit: number) => {
      const results: string[] = [];
      let cursor = undefined;

      // To avoid running the test forever
      let i = 0;

      do {
        const res = await apiCallers[0].bookmarks.getBookmarks({
          limit,
          cursor,
          useCursorV2: true,
        });
        results.push(...res.bookmarks.map((b) => b.id));
        cursor = res.nextCursor;
        i++;
      } while (cursor && i < 100);

      expect(results.sort()).toEqual(inserted.map((b) => b.id).sort());
    };

    await validateWithLimit(1);
    await validateWithLimit(2);
    await validateWithLimit(3);
    await validateWithLimit(10);
    await validateWithLimit(100);
  });

  test<CustomTestContext>("getBookmark", async ({ apiCallers }) => {
    const api = apiCallers[0].bookmarks;
    const createdBookmark = await api.createBookmark({
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    // Test successful getBookmark with includeContent false
    const bookmarkWithoutContent = await api.getBookmark({
      bookmarkId: createdBookmark.id,
      includeContent: false,
    });
    expect(bookmarkWithoutContent.id).toEqual(createdBookmark.id);
    expect(bookmarkWithoutContent.content).toBeDefined(); // Content should still be present but might be partial
    expect(bookmarkWithoutContent.content.type).toEqual(BookmarkTypes.LINK);
    assert(bookmarkWithoutContent.content.type == BookmarkTypes.LINK);
    expect(bookmarkWithoutContent.content.url).toEqual("https://example.com");

    // Test successful getBookmark with includeContent true
    const bookmarkWithContent = await api.getBookmark({
      bookmarkId: createdBookmark.id,
      includeContent: true,
    });
    expect(bookmarkWithContent.id).toEqual(createdBookmark.id);
    expect(bookmarkWithContent.content).toBeDefined();
    expect(bookmarkWithContent.content.type).toEqual(BookmarkTypes.LINK);
    assert(bookmarkWithContent.content.type == BookmarkTypes.LINK);
    expect(bookmarkWithContent.content.url).toEqual("https://example.com");
    // Additional checks if content includes more details, e.g., htmlContent if available

    // Test non-existent bookmark
    await expect(() =>
      api.getBookmark({ bookmarkId: "non-existent-id" }),
    ).rejects.toThrow(/Bookmark not found/);
  });

  test<CustomTestContext>("getBrokenLinks", async ({ apiCallers, db }) => {
    const api = apiCallers[0].bookmarks;

    // Create a broken link bookmark (simulate by setting crawlStatus to 'failure')
    const brokenBookmark = await api.createBookmark({
      url: "https://broken-link.com",
      type: BookmarkTypes.LINK,
    });
    await db
      .update(bookmarkLinks)
      .set({ crawlStatus: "failure" })
      .where(eq(bookmarkLinks.id, brokenBookmark.id));

    const result = await api.getBrokenLinks();
    expect(result.bookmarks.length).toBeGreaterThan(0);
    expect(
      result.bookmarks.some((b) => b.id === brokenBookmark.id),
    ).toBeTruthy();
    expect(result.bookmarks[0].url).toEqual("https://broken-link.com");
    expect(result.bookmarks[0].isCrawlingFailure).toBeTruthy();

    // Test with no broken links
    await db
      .update(bookmarkLinks)
      .set({ crawlStatus: "success" })
      .where(eq(bookmarkLinks.id, brokenBookmark.id));
    const emptyResult = await api.getBrokenLinks();
    expect(emptyResult.bookmarks.length).toEqual(0);
  });

  describe("Bookmark Quotas", () => {
    test<CustomTestContext>("create bookmark with no quota (unlimited)", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0].bookmarks;

      // User should be able to create bookmarks without any quota restrictions
      const bookmark1 = await api.createBookmark({
        url: "https://example1.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark1.alreadyExists).toEqual(false);

      const bookmark2 = await api.createBookmark({
        url: "https://example2.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark2.alreadyExists).toEqual(false);

      const bookmark3 = await api.createBookmark({
        text: "Test text bookmark",
        type: BookmarkTypes.TEXT,
      });
      expect(bookmark3.alreadyExists).toEqual(false);
    });

    test<CustomTestContext>("create bookmark with quota limit", async ({
      apiCallers,
      db,
    }) => {
      const user = await apiCallers[0].users.whoami();
      const api = apiCallers[0].bookmarks;

      // Set quota to 2 bookmarks for this user
      await db
        .update(users)
        .set({ bookmarkQuota: 2 })
        .where(eq(users.id, user.id));

      // First bookmark should succeed
      const bookmark1 = await api.createBookmark({
        url: "https://example1.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark1.alreadyExists).toEqual(false);

      // Second bookmark should succeed
      const bookmark2 = await api.createBookmark({
        url: "https://example2.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark2.alreadyExists).toEqual(false);

      // Third bookmark should fail due to quota
      await expect(() =>
        api.createBookmark({
          url: "https://example3.com",
          type: BookmarkTypes.LINK,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 2 bookmarks./,
      );
    });

    test<CustomTestContext>("create bookmark with quota limit - different types", async ({
      apiCallers,
      db,
    }) => {
      const user = await apiCallers[0].users.whoami();
      const api = apiCallers[0].bookmarks;

      // Set quota to 2 bookmarks for this user
      await db
        .update(users)
        .set({ bookmarkQuota: 2 })
        .where(eq(users.id, user.id));

      // Create one link bookmark
      await api.createBookmark({
        url: "https://example1.com",
        type: BookmarkTypes.LINK,
      });

      // Create one text bookmark
      await api.createBookmark({
        text: "Test text content",
        type: BookmarkTypes.TEXT,
      });

      // Third bookmark (any type) should fail
      await expect(() =>
        api.createBookmark({
          text: "Another text bookmark",
          type: BookmarkTypes.TEXT,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 2 bookmarks./,
      );
    });

    test<CustomTestContext>("quota enforcement after deletion", async ({
      apiCallers,
      db,
    }) => {
      const user = await apiCallers[0].users.whoami();
      const api = apiCallers[0].bookmarks;

      // Set quota to 1 bookmark for this user
      await db
        .update(users)
        .set({ bookmarkQuota: 1 })
        .where(eq(users.id, user.id));

      // Create first bookmark
      const bookmark1 = await api.createBookmark({
        url: "https://example1.com",
        type: BookmarkTypes.LINK,
      });

      // Second bookmark should fail
      await expect(() =>
        api.createBookmark({
          url: "https://example2.com",
          type: BookmarkTypes.LINK,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 1 bookmarks./,
      );

      // Delete the first bookmark
      await api.deleteBookmark({ bookmarkId: bookmark1.id });

      // Now should be able to create a new bookmark
      const bookmark2 = await api.createBookmark({
        url: "https://example2.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark2.alreadyExists).toEqual(false);
    });

    test<CustomTestContext>("quota isolation between users", async ({
      apiCallers,
      db,
    }) => {
      const user1 = await apiCallers[0].users.whoami();

      // Set quota to 1 for user1, unlimited for user2
      await db
        .update(users)
        .set({ bookmarkQuota: 1 })
        .where(eq(users.id, user1.id));

      // User1 creates one bookmark (reaches quota)
      await apiCallers[0].bookmarks.createBookmark({
        url: "https://user1-example.com",
        type: BookmarkTypes.LINK,
      });

      // User1 cannot create another bookmark
      await expect(() =>
        apiCallers[0].bookmarks.createBookmark({
          url: "https://user1-example2.com",
          type: BookmarkTypes.LINK,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 1 bookmarks./,
      );

      // User2 should be able to create multiple bookmarks (no quota)
      await apiCallers[1].bookmarks.createBookmark({
        url: "https://user2-example1.com",
        type: BookmarkTypes.LINK,
      });

      await apiCallers[1].bookmarks.createBookmark({
        url: "https://user2-example2.com",
        type: BookmarkTypes.LINK,
      });

      await apiCallers[1].bookmarks.createBookmark({
        text: "User2 text bookmark",
        type: BookmarkTypes.TEXT,
      });
    });

    test<CustomTestContext>("quota with zero limit", async ({
      apiCallers,
      db,
    }) => {
      const user = await apiCallers[0].users.whoami();
      const api = apiCallers[0].bookmarks;

      // Set quota to 0 bookmarks for this user
      await db
        .update(users)
        .set({ bookmarkQuota: 0 })
        .where(eq(users.id, user.id));

      // Any bookmark creation should fail
      await expect(() =>
        api.createBookmark({
          url: "https://example.com",
          type: BookmarkTypes.LINK,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 0 bookmarks./,
      );

      await expect(() =>
        api.createBookmark({
          text: "Test text",
          type: BookmarkTypes.TEXT,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 0 bookmarks./,
      );
    });

    test<CustomTestContext>("quota does not affect duplicate link detection", async ({
      apiCallers,
      db,
    }) => {
      const user = await apiCallers[0].users.whoami();
      const api = apiCallers[0].bookmarks;

      // Set quota to 1 bookmark for this user
      await db
        .update(users)
        .set({ bookmarkQuota: 1 })
        .where(eq(users.id, user.id));

      // Create first bookmark
      const bookmark1 = await api.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark1.alreadyExists).toEqual(false);

      // Try to create the same URL again - should return existing bookmark, not fail with quota
      const bookmark2 = await api.createBookmark({
        url: "https://example.com",
        type: BookmarkTypes.LINK,
      });
      expect(bookmark2.alreadyExists).toEqual(true);
      expect(bookmark2.id).toEqual(bookmark1.id);

      // But creating a different URL should fail due to quota
      await expect(() =>
        api.createBookmark({
          url: "https://different-example.com",
          type: BookmarkTypes.LINK,
        }),
      ).rejects.toThrow(
        /Bookmark quota exceeded. You can only have 1 bookmarks./,
      );
    });
  });
});
