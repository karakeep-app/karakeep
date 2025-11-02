import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";

import {
  BookmarkTypes,
  zNewBookmarkRequestSchema,
} from "@karakeep/shared/types/bookmarks";
import { zNewBookmarkListSchema } from "@karakeep/shared/types/lists";

import type { APICallerType, CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

async function createTestBookmark(api: APICallerType) {
  const newBookmarkInput: z.infer<typeof zNewBookmarkRequestSchema> = {
    type: BookmarkTypes.TEXT,
    text: "Test bookmark text",
  };
  const createdBookmark = await api.bookmarks.createBookmark(newBookmarkInput);
  return createdBookmark.id;
}

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Lists Routes", () => {
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

describe("recursive delete", () => {
  test<CustomTestContext>("non-recursive delete (deleteChildren=false)", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // Create parent list
    const parentInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Parent List",
      type: "manual",
      icon: "📂",
    };
    const parentList = await api.create(parentInput);

    // Create child list
    const childInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Child List",
      parentId: parentList.id,
      type: "manual",
      icon: "📄",
    };
    const childList = await api.create(childInput);

    // Test both default behavior and explicit false
    // Default (should be false)
    await api.delete({ listId: parentList.id });

    let lists = await api.list();
    expect(lists.lists.find((l) => l.id === parentList.id)).toBeUndefined();
    let remainingChild = lists.lists.find((l) => l.id === childList.id);
    expect(remainingChild).toBeDefined();
    expect(remainingChild?.parentId).toBeNull();

    // Create another parent-child pair to test explicit false
    const parent2 = await api.create({
      name: "Parent List 2",
      type: "manual",
      icon: "📂",
    });
    const child2 = await api.create({
      name: "Child List 2",
      parentId: parent2.id,
      type: "manual",
      icon: "📄",
    });

    // Explicit deleteChildren=false
    await api.delete({ listId: parent2.id, deleteChildren: false });

    lists = await api.list();
    expect(lists.lists.find((l) => l.id === parent2.id)).toBeUndefined();
    remainingChild = lists.lists.find((l) => l.id === child2.id);
    expect(remainingChild).toBeDefined();
    expect(remainingChild?.parentId).toBeNull();
  });

  test<CustomTestContext>("recursive delete with multiple children", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // Create parent list
    const parentInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Parent List",
      type: "manual",
      icon: "📂",
    };
    const parentList = await api.create(parentInput);

    // Create multiple child lists
    const child1Input: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Child List 1",
      parentId: parentList.id,
      type: "manual",
      icon: "📄",
    };
    const child1 = await api.create(child1Input);

    const child2Input: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Child List 2",
      parentId: parentList.id,
      type: "manual",
      icon: "📄",
    };
    const child2 = await api.create(child2Input);

    const child3Input: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Child List 3",
      parentId: parentList.id,
      type: "smart",
      query: "is:fav",
      icon: "⭐",
    };
    const child3 = await api.create(child3Input);

    // Delete parent with deleteChildren=true
    await api.delete({ listId: parentList.id, deleteChildren: true });

    // Verify all lists are deleted
    const lists = await api.list();
    expect(lists.lists.find((l) => l.id === parentList.id)).toBeUndefined();
    expect(lists.lists.find((l) => l.id === child1.id)).toBeUndefined();
    expect(lists.lists.find((l) => l.id === child2.id)).toBeUndefined();
    expect(lists.lists.find((l) => l.id === child3.id)).toBeUndefined();
  });

  test<CustomTestContext>("recursive delete preserves bookmarks in deleted lists", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // Create a bookmark first
    const bookmarkId = await createTestBookmark(apiCallers[0]);

    // Create parent list
    const parentInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Parent List",
      type: "manual",
      icon: "📂",
    };
    const parentList = await api.create(parentInput);

    // Create child list with bookmark
    const childInput: z.infer<typeof zNewBookmarkListSchema> = {
      name: "Child List",
      parentId: parentList.id,
      type: "manual",
      icon: "📄",
    };
    const childList = await api.create(childInput);

    // Add bookmark to child list
    await api.addToList({ listId: childList.id, bookmarkId });

    // Verify bookmark is in the list
    const listsBeforeDelete = await api.getListsOfBookmark({ bookmarkId });
    expect(
      listsBeforeDelete.lists.find((l) => l.id === childList.id),
    ).toBeDefined();

    // Delete parent with deleteChildren=true
    await api.delete({ listId: parentList.id, deleteChildren: true });

    // Verify lists are deleted
    const allLists = await api.list();
    expect(allLists.lists.find((l) => l.id === parentList.id)).toBeUndefined();
    expect(allLists.lists.find((l) => l.id === childList.id)).toBeUndefined();

    // Verify bookmark still exists but is not in any list
    const listsAfterDelete = await api.getListsOfBookmark({ bookmarkId });
    expect(listsAfterDelete.lists).toHaveLength(0);

    // Verify the bookmark itself still exists by trying to access it
    const bookmark = await apiCallers[0].bookmarks.getBookmark({
      bookmarkId,
    });
    expect(bookmark).toBeDefined();
    expect(bookmark.id).toBe(bookmarkId);
  });

  test<CustomTestContext>("recursive delete with complex hierarchy", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // Create a complex tree structure:
    //     root
    //    /  |  \
    //   A   B   C
    //  /|   |   |\
    // D E   F   G H
    //       |
    //       I

    const root = await api.create({
      name: "Root",
      type: "manual",
      icon: "🌳",
    });

    const listA = await api.create({
      name: "List A",
      parentId: root.id,
      type: "manual",
      icon: "📂",
    });

    const listB = await api.create({
      name: "List B",
      parentId: root.id,
      type: "smart",
      query: "is:fav",
      icon: "📂",
    });

    const listC = await api.create({
      name: "List C",
      parentId: root.id,
      type: "manual",
      icon: "📂",
    });

    const listD = await api.create({
      name: "List D",
      parentId: listA.id,
      type: "manual",
      icon: "📄",
    });

    const listE = await api.create({
      name: "List E",
      parentId: listA.id,
      type: "smart",
      query: "is:archived",
      icon: "📄",
    });

    const listF = await api.create({
      name: "List F",
      parentId: listB.id,
      type: "manual",
      icon: "📄",
    });

    const listG = await api.create({
      name: "List G",
      parentId: listC.id,
      type: "manual",
      icon: "📄",
    });

    const listH = await api.create({
      name: "List H",
      parentId: listC.id,
      type: "smart",
      query: "is:fav",
      icon: "📄",
    });

    const listI = await api.create({
      name: "List I",
      parentId: listF.id,
      type: "manual",
      icon: "📄",
    });

    const allCreatedIds = [
      root.id,
      listA.id,
      listB.id,
      listC.id,
      listD.id,
      listE.id,
      listF.id,
      listG.id,
      listH.id,
      listI.id,
    ];

    // Delete root with deleteChildren=true
    await api.delete({ listId: root.id, deleteChildren: true });

    // Verify entire tree is deleted
    const remainingLists = await api.list();
    allCreatedIds.forEach((id) => {
      expect(remainingLists.lists.find((l) => l.id === id)).toBeUndefined();
    });
  });

  test<CustomTestContext>("recursive delete edge cases", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // Test 1: Delete list with no children (should work fine)
    const standaloneList = await api.create({
      name: "Standalone List",
      type: "manual",
      icon: "📄",
    });

    await api.delete({ listId: standaloneList.id, deleteChildren: true });
    let lists = await api.list();
    expect(lists.lists.find((l) => l.id === standaloneList.id)).toBeUndefined();

    // Test 2: Delete child directly (no recursion needed)
    const parent = await api.create({
      name: "Parent",
      type: "manual",
      icon: "📂",
    });

    const child = await api.create({
      name: "Child",
      parentId: parent.id,
      type: "manual",
      icon: "📄",
    });

    await api.delete({ listId: child.id, deleteChildren: true });
    lists = await api.list();
    expect(lists.lists.find((l) => l.id === parent.id)).toBeDefined();
    expect(lists.lists.find((l) => l.id === child.id)).toBeUndefined();
  });

  test<CustomTestContext>("partial recursive delete on middle node", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].lists;

    // Create hierarchy: grandparent -> parent -> child
    const grandparent = await api.create({
      name: "Grandparent",
      type: "manual",
      icon: "📂",
    });

    const parent = await api.create({
      name: "Parent",
      parentId: grandparent.id,
      type: "manual",
      icon: "📂",
    });

    const child = await api.create({
      name: "Child",
      parentId: parent.id,
      type: "manual",
      icon: "📄",
    });

    // Delete middle node (parent) with deleteChildren=true
    await api.delete({ listId: parent.id, deleteChildren: true });

    // Verify parent and child are deleted, but grandparent remains
    const lists = await api.list();
    expect(lists.lists.find((l) => l.id === grandparent.id)).toBeDefined();
    expect(lists.lists.find((l) => l.id === parent.id)).toBeUndefined();
    expect(lists.lists.find((l) => l.id === child.id)).toBeUndefined();
  });
});
