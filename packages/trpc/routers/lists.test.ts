import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
  BookmarkTypes,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import { zNewBookmarkListSchema } from "@karakeep/shared/types/lists";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Lists Routes", () => {
  async function createTestBookmark(api: APICallerType) {
    const newBookmarkInput: z.infer<typeof zNewBookmarkRequestSchema> = {
      type: BookmarkTypes.TEXT,
      text: "Test bookmark text",
    };
    const createdBookmark =
      await api.bookmarks.createBookmark(newBookmarkInput);
    return createdBookmark.id;
  }

  test<CustomTestContext>("create list", async ({ apiCallers }) => {
    const api = apiCallers[0].lists;
    const newListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Test List",
      description: "A test list",
      icon: "📋",
      type: "manual",
    };

    const createdList = await api.create(newListInput);

    expect(createdList).toMatchObject({
      name: newListInput.name,
      description: newListInput.description,
      icon: newListInput.icon,
      type: newListInput.type,
    });

    const lists = await api.list();
    const listFromList = lists.lists.find((l) => l.id === createdList.id);
    expect(listFromList).toBeDefined();
    expect(listFromList?.name).toEqual(newListInput.name);
  });

  test<CustomTestContext>("edit list", async ({ apiCallers }) => {
    const api = apiCallers[0].lists;

    // First, create a list
    const createdListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Original List",
      description: "Original description",
      icon: "📋",
      type: "manual",
    };
    const createdList = await api.create(createdListInput);

    // Update it
    const updatedListInput = {
      listId: createdList.id,
      name: "Updated List",
      description: "Updated description",
      icon: "⭐️",
    };
    const updatedList = await api.edit(updatedListInput);

    expect(updatedList.name).toEqual(updatedListInput.name);
    expect(updatedList.description).toEqual(updatedListInput.description);
    expect(updatedList.icon).toEqual(updatedListInput.icon);

    // Verify the update
    const lists = await api.list();
    const listFromList = lists.lists.find((l) => l.id === createdList.id);
    expect(listFromList).toBeDefined();
    expect(listFromList?.name).toEqual(updatedListInput.name);

    // Test editing a non-existent list
    await expect(() =>
      api.edit({ listId: "non-existent-id", name: "Fail" }),
    ).rejects.toThrow(/List not found/);
  });

  test<CustomTestContext>("merge lists", async ({ apiCallers }) => {
    const api = apiCallers[0].lists;

    // First, create a real bookmark
    const bookmarkId = await createTestBookmark(apiCallers[0]);

    // Create two lists
    const sourceListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Source List",
      type: "manual",
      icon: "📚",
    };
    const targetListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Target List",
      type: "manual",
      icon: "📖",
    };
    const sourceList = await api.create(sourceListInput);
    const targetList = await api.create(targetListInput);

    // Add the real bookmark to source list
    await api.addToList({ listId: sourceList.id, bookmarkId });

    // Merge
    await api.merge({
      sourceId: sourceList.id,
      targetId: targetList.id,
      deleteSourceAfterMerge: true,
    });

    // Verify source list is deleted and bookmark is in target
    const lists = await api.list();
    expect(lists.lists.find((l) => l.id === sourceList.id)).toBeUndefined();
    const targetListsOfBookmark = await api.getListsOfBookmark({
      bookmarkId,
    });
    expect(
      targetListsOfBookmark.lists.find((l) => l.id === targetList.id),
    ).toBeDefined();

    // Test merging invalid lists
    await expect(() =>
      api.merge({
        sourceId: sourceList.id,
        targetId: "non-existent-id",
        deleteSourceAfterMerge: true,
      }),
    ).rejects.toThrow(/List not found/);
  });

  test<CustomTestContext>("delete list", async ({ apiCallers }) => {
    const api = apiCallers[0].lists;

    // Create a list
    const createdListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "List to Delete",
      type: "manual",
      icon: "📚",
    };
    const createdList = await api.create(createdListInput);

    // Delete it
    await api.delete({ listId: createdList.id });

    // Verify it's deleted
    const lists = await api.list();
    expect(lists.lists.find((l) => l.id === createdList.id)).toBeUndefined();

    // Test deleting a non-existent list
    await expect(() =>
      api.delete({ listId: "non-existent-id" }),
    ).rejects.toThrow(/List not found/);
  });

  test<CustomTestContext>("add and remove from list", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // First, create a real bookmark
    const bookmarkId = await createTestBookmark(apiCallers[0]);

    // Create a manual list
    const listInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Manual List",
      type: "manual",
      icon: "📚",
    };
    const createdList = await api.create(listInput);

    // Add to list
    await api.addToList({ listId: createdList.id, bookmarkId });

    // Verify addition
    const listsOfBookmark = await api.getListsOfBookmark({
      bookmarkId,
    });
    expect(
      listsOfBookmark.lists.find((l) => l.id === createdList.id),
    ).toBeDefined();

    // Remove from list
    await api.removeFromList({ listId: createdList.id, bookmarkId });

    // Verify removal
    const updatedListsOfBookmark = await api.getListsOfBookmark({
      bookmarkId,
    });
    expect(
      updatedListsOfBookmark.lists.find((l) => l.id === createdList.id),
    ).toBeUndefined();

    // Test on smart list (should fail)
    const smartListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Smart List",
      type: "smart",
      query: "#example",
      icon: "📚",
    };
    const smartList = await api.create(smartListInput);
    await expect(() =>
      api.addToList({ listId: smartList.id, bookmarkId }),
    ).rejects.toThrow(/Smart lists cannot be added to/);
  });

  test<CustomTestContext>("get and list lists", async ({ apiCallers }) => {
    const api = apiCallers[0].lists;

    const newListInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Get Test List",
      type: "manual",
      icon: "📚",
    };
    const createdList = await api.create(newListInput);

    const getList = await api.get({ listId: createdList.id });
    expect(getList.name).toEqual(newListInput.name);

    const lists = await api.list();
    expect(lists.lists.length).toBeGreaterThan(0);
    expect(lists.lists.find((l) => l.id === createdList.id)).toBeDefined();
  });

  test<CustomTestContext>("get lists of bookmark and stats", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // First, create a real bookmark
    const bookmarkId = await createTestBookmark(apiCallers[0]);

    // Create a list and add the bookmark
    const listInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Stats Test List",
      type: "manual",
      icon: "📚",
    };
    const createdList = await api.create(listInput);
    await api.addToList({ listId: createdList.id, bookmarkId });

    const listsOfBookmark = await api.getListsOfBookmark({
      bookmarkId,
    });
    expect(listsOfBookmark.lists.length).toBeGreaterThan(0);

    const stats = await api.stats();
    expect(stats.stats.get(createdList.id)).toBeGreaterThan(0);
  });
});
