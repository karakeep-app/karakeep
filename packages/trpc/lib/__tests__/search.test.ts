import { beforeEach, describe, expect, it } from "vitest";

import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  bookmarkAssets,
  bookmarkLinks,
  bookmarkLists,
  bookmarks,
  bookmarksInLists,
  bookmarkTags,
  bookmarkTexts,
  rssFeedImportsTable,
  rssFeedsTable,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Matcher } from "@karakeep/shared/types/search";

import { AuthedContext } from "../..";
import { getBookmarkIdsFromMatcher } from "../search";

let mockCtx: AuthedContext;
let testUserId: string;

beforeEach(async () => {
  const db = getInMemoryDB(true);
  testUserId = "test-user";

  await db.insert(users).values([
    {
      id: testUserId,
      name: "Test User",
      email: "test@example.com",
      role: "user",
    },
  ]);

  // Setup test data
  await db.insert(bookmarks).values([
    {
      id: "b1",
      type: BookmarkTypes.LINK,
      userId: testUserId,
      archived: false,
      favourited: false,
      createdAt: new Date("2024-01-01"),
      title: null,
    },
    {
      id: "b2",
      type: BookmarkTypes.LINK,
      userId: testUserId,
      archived: true,
      favourited: true,
      createdAt: new Date("2024-01-02"),
      title: "example domain page",
    },
    {
      id: "b3",
      type: BookmarkTypes.TEXT,
      userId: testUserId,
      archived: true,
      favourited: false,
      createdAt: new Date("2024-01-03"),
      title: "third bookmark",
    },
    {
      id: "b4",
      type: BookmarkTypes.LINK,
      userId: testUserId,
      archived: false,
      favourited: true,
      createdAt: new Date("2024-01-04"),
      title: "another example page",
    },
    {
      id: "b5",
      type: BookmarkTypes.TEXT,
      userId: testUserId,
      archived: false,
      favourited: false,
      createdAt: new Date("2024-01-05"),
      title: "fifth text",
    },
    {
      id: "b6",
      type: BookmarkTypes.ASSET,
      userId: testUserId,
      archived: true,
      favourited: false,
      createdAt: new Date("2024-01-06"),
      title: "example asset",
    },
  ]);

  await db.insert(bookmarkLinks).values([
    { id: "b1", url: "https://example.com/page1", title: "example link" },
    { id: "b2", url: "https://test.com/page2" },
    { id: "b4", url: "https://example.com/page3" },
  ]);

  await db.insert(bookmarkTexts).values([
    {
      id: "b3",
      text: "This is a test bookmark",
      sourceUrl: "https://example.com/page1",
    },
    {
      id: "b5",
      text: "Another text bookmark",
      sourceUrl: null,
    },
  ]);

  await db.insert(bookmarkAssets).values([
    {
      id: "b6",
      assetType: "image",
      fileName: "test.png",
      assetId: "asset-id",
      sourceUrl: "https://example.com/image.png",
    },
  ]);

  await db.insert(bookmarkTags).values([
    { id: "t1", userId: testUserId, name: "tag1" },
    { id: "t2", userId: testUserId, name: "tag2" },
    { id: "t3", userId: testUserId, name: "important" },
    { id: "t4", userId: testUserId, name: "work" },
  ]);

  await db.insert(tagsOnBookmarks).values([
    { bookmarkId: "b1", tagId: "t1", attachedBy: "ai" },
    { bookmarkId: "b2", tagId: "t2", attachedBy: "ai" },
    { bookmarkId: "b4", tagId: "t3", attachedBy: "human" },
    { bookmarkId: "b5", tagId: "t4", attachedBy: "human" },
    { bookmarkId: "b6", tagId: "t3", attachedBy: "ai" },
  ]);

  await db.insert(bookmarkLists).values([
    { id: "l1", userId: testUserId, name: "list1", icon: "🚀", type: "manual" },
    { id: "l2", userId: testUserId, name: "list2", icon: "🚀", type: "manual" },
    {
      id: "l3",
      userId: testUserId,
      name: "favorites",
      icon: "⭐",
      type: "manual",
    },
    { id: "l4", userId: testUserId, name: "work", icon: "💼", type: "manual" },
  ]);

  await db.insert(bookmarksInLists).values([
    { bookmarkId: "b1", listId: "l1" },
    { bookmarkId: "b2", listId: "l2" },
    { bookmarkId: "b4", listId: "l3" },
    { bookmarkId: "b5", listId: "l4" },
    { bookmarkId: "b6", listId: "l1" },
  ]);

  await db.insert(rssFeedsTable).values([
    { id: "f1", userId: testUserId, name: "feed1", url: "url1" },
    { id: "f2", userId: testUserId, name: "feed2", url: "url2" },
  ]);

  await db.insert(rssFeedImportsTable).values([
    {
      id: "imp1",
      entryId: "entry1",
      rssFeedId: "f1",
      bookmarkId: "b1",
    },
    {
      id: "imp2",
      entryId: "entry2",
      rssFeedId: "f2",
      bookmarkId: "b3",
    },
    {
      id: "imp3",
      entryId: "entry3",
      rssFeedId: "f1",
      bookmarkId: "b5",
    },
  ]);

  mockCtx = {
    db,
    user: {
      id: testUserId,
      name: "Test User",
      email: "test@example.com",
      role: "user",
    },
    req: {
      ip: "127.0.0.1",
    },
  };
});

describe("getBookmarkIdsFromMatcher", () => {
  it("should handle tagName matcher", async () => {
    const matcher: Matcher = {
      type: "tagName",
      tagName: "tag1",
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1"]);
  });

  it("should handle tagName matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "tagName",
      tagName: "tag1",
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b2", "b3", "b4", "b5", "b6"]);
  });

  it("should handle listName matcher", async () => {
    const matcher: Matcher = {
      type: "listName",
      listName: "list1",
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1", "b6"]);
  });

  it("should handle listName matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "listName",
      listName: "list1",
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b2", "b3", "b4", "b5"]);
  });

  it("should handle archived matcher", async () => {
    const matcher: Matcher = { type: "archived", archived: true };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b2", "b3", "b6"]);
  });

  it("should handle archived matcher archived=false", async () => {
    const matcher: Matcher = { type: "archived", archived: false };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1", "b4", "b5"]);
  });

  it("should handle favourited matcher", async () => {
    const matcher: Matcher = { type: "favourited", favourited: true };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b2", "b4"]);
  });

  it("should handle favourited matcher favourited=false", async () => {
    const matcher: Matcher = { type: "favourited", favourited: false };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1", "b3", "b5", "b6"]);
  });

  it("should handle url matcher", async () => {
    const matcher: Matcher = {
      type: "url",
      url: "example.com",
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1", "b4", "b6"]);
  });

  it("should handle url matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "url",
      url: "example.com",
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    // Not that only bookmarks of type link are returned
    expect(result.sort()).toEqual(["b2"]);
  });

  it("should handle title matcher", async () => {
    const matcher: Matcher = {
      type: "title",
      title: "example",
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b1", "b2", "b4", "b6"]);
  });

  it("should handle title matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "title",
      title: "example",
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b3", "b5"]);
  });

  it("should handle dateAfter matcher", async () => {
    const matcher: Matcher = {
      type: "dateAfter",
      dateAfter: new Date("2024-01-02"),
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b2", "b3", "b4", "b5", "b6"]);
  });

  it("should handle dateAfter matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "dateAfter",
      dateAfter: new Date("2024-01-02"),
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1"]);
  });

  it("should handle dateBefore matcher", async () => {
    const matcher: Matcher = {
      type: "dateBefore",
      dateBefore: new Date("2024-01-02"),
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b1", "b2"]);
  });

  it("should handle type matcher", async () => {
    expect(
      await getBookmarkIdsFromMatcher(mockCtx, {
        type: "type",
        typeName: BookmarkTypes.LINK,
        inverse: false,
      }),
    ).toEqual(["b1", "b2", "b4"]);
    expect(
      await getBookmarkIdsFromMatcher(mockCtx, {
        type: "type",
        typeName: BookmarkTypes.TEXT,
        inverse: false,
      }),
    ).toEqual(["b3", "b5"]);
    expect(
      await getBookmarkIdsFromMatcher(mockCtx, {
        type: "type",
        typeName: BookmarkTypes.ASSET,
        inverse: false,
      }),
    ).toEqual(["b6"]);
  });

  it("should handle type matcher with inverse=true", async () => {
    expect(
      await getBookmarkIdsFromMatcher(mockCtx, {
        type: "type",
        typeName: BookmarkTypes.LINK,
        inverse: true,
      }),
    ).toEqual(["b3", "b5", "b6"]);
    expect(
      await getBookmarkIdsFromMatcher(mockCtx, {
        type: "type",
        typeName: BookmarkTypes.TEXT,
        inverse: true,
      }),
    ).toEqual(["b1", "b2", "b4", "b6"]);
    expect(
      await getBookmarkIdsFromMatcher(mockCtx, {
        type: "type",
        typeName: BookmarkTypes.ASSET,
        inverse: true,
      }),
    ).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  });

  it("should handle dateBefore matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "dateBefore",
      dateBefore: new Date("2024-01-02"),
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b3", "b4", "b5", "b6"]);
  });

  it("should handle AND matcher", async () => {
    const matcher: Matcher = {
      type: "and",
      matchers: [
        { type: "archived", archived: true },
        { type: "favourited", favourited: true },
      ],
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b2"]);
  });

  it("should handle OR matcher #1", async () => {
    const matcher: Matcher = {
      type: "or",
      matchers: [
        { type: "archived", archived: true },
        { type: "favourited", favourited: true },
      ],
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b2", "b3", "b4", "b6"]);
  });

  it("should handle OR matcher #2", async () => {
    const matcher: Matcher = {
      type: "or",
      matchers: [
        { type: "listName", listName: "favorites", inverse: false },
        { type: "tagName", tagName: "work", inverse: false },
      ],
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b4", "b5"]);
  });

  it("should handle nested complex matchers", async () => {
    const matcher: Matcher = {
      type: "and",
      matchers: [
        {
          type: "or",
          matchers: [
            { type: "listName", listName: "favorites", inverse: false },
            { type: "tagName", tagName: "work", inverse: false },
          ],
        },
        {
          type: "or",
          matchers: [
            { type: "archived", archived: true },
            { type: "favourited", favourited: true },
          ],
        },
      ],
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b4"]);
  });

  it("should handle tagged matcher", async () => {
    const matcher: Matcher = { type: "tagged", tagged: true };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b1", "b2", "b4", "b5", "b6"]);
  });

  it("should handle tagged matcher with tagged=false", async () => {
    const matcher: Matcher = { type: "tagged", tagged: false };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b3"]);
  });

  it("should handle inlist matcher", async () => {
    const matcher: Matcher = { type: "inlist", inList: true };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b1", "b2", "b4", "b5", "b6"]);
  });

  it("should handle inlist matcher with inList=false", async () => {
    const matcher: Matcher = { type: "inlist", inList: false };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result).toEqual(["b3"]);
  });

  it("should handle rssFeedName matcher", async () => {
    const matcher: Matcher = {
      type: "rssFeedName",
      feedName: "feed1",
      inverse: false,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b1", "b5"]);
  });

  it("should handle rssFeedName matcher with inverse=true", async () => {
    const matcher: Matcher = {
      type: "rssFeedName",
      feedName: "feed1",
      inverse: true,
    };
    const result = await getBookmarkIdsFromMatcher(mockCtx, matcher);
    expect(result.sort()).toEqual(["b2", "b3", "b4", "b6"]);
  });

  it("should throw error for unknown matcher type", async () => {
    const matcher = { type: "unknown" } as unknown as Matcher;
    await expect(getBookmarkIdsFromMatcher(mockCtx, matcher)).rejects.toThrow(
      "Unknown matcher type",
    );
  });
});
