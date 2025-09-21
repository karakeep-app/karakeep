import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { bookmarkTags } from "@karakeep/db/schema";
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

  test<CustomTestContext>("list tags", async ({ apiCallers }) => {
    const api = apiCallers[0].tags;
    await api.create({ name: "tag1" });
    await api.create({ name: "tag2" });

    const res = await api.list();
    expect(res.tags.length).toBeGreaterThanOrEqual(2);
    expect(res.tags.some((tag) => tag.name === "tag1")).toBeTruthy();
    expect(res.tags.some((tag) => tag.name === "tag2")).toBeTruthy();
  });

  test<CustomTestContext>("list tags includes bookmark stats", async ({
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

  test<CustomTestContext>("list tags - privacy", async ({ apiCallers }) => {
    const apiUser1 = apiCallers[0].tags;
    await apiUser1.create({ name: "user1Tag" });

    const apiUser2 = apiCallers[1].tags; // Different user
    const resUser2 = await apiUser2.list();
    expect(resUser2.tags.some((tag) => tag.name === "user1Tag")).toBeFalsy(); // Should not see other user's tags
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
