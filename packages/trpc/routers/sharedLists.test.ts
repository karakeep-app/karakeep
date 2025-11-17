import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Shared Lists", () => {
  describe("List Collaboration Management", () => {
    test<CustomTestContext>("should allow owner to add a collaborator by email", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      // Create a list as owner
      const list = await ownerApi.lists.create({
        name: "Test Shared List",
        icon: "📚",
        type: "manual",
      });

      // Get collaborator email
      const collaboratorUser = await collaboratorApi.users.whoami();
      const collaboratorEmail = collaboratorUser.email!;

      // Add collaborator
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Verify collaborator was added
      const { collaborators, owner } = await ownerApi.lists.getCollaborators({
        listId: list.id,
      });

      expect(collaborators).toHaveLength(1);
      expect(collaborators[0].user.email).toBe(collaboratorEmail);
      expect(collaborators[0].role).toBe("viewer");

      // Verify owner is included
      const ownerUser = await ownerApi.users.whoami();
      expect(owner).toBeDefined();
      expect(owner?.email).toBe(ownerUser.email);
    });

    test<CustomTestContext>("should not allow adding owner as collaborator", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const ownerUser = await ownerApi.users.whoami();

      await expect(
        ownerApi.lists.addCollaborator({
          listId: list.id,
          email: ownerUser.email!,
          role: "viewer",
        }),
      ).rejects.toThrow("Cannot add the list owner as a collaborator");
    });

    test<CustomTestContext>("should not allow adding duplicate collaborator", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Try to add same collaborator again
      await expect(
        ownerApi.lists.addCollaborator({
          listId: list.id,
          email: collaboratorEmail,
          role: "editor",
        }),
      ).rejects.toThrow("User is already a collaborator on this list");
    });

    test<CustomTestContext>("should allow owner to update collaborator role", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorUser = await collaboratorApi.users.whoami();

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorUser.email!,
        role: "viewer",
      });

      // Update role to editor
      await ownerApi.lists.updateCollaboratorRole({
        listId: list.id,
        userId: collaboratorUser.id,
        role: "editor",
      });

      // Verify role was updated
      const { collaborators, owner } = await ownerApi.lists.getCollaborators({
        listId: list.id,
      });

      expect(collaborators[0].role).toBe("editor");
      expect(owner).toBeDefined();
    });

    test<CustomTestContext>("should allow owner to remove collaborator", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorUser = await collaboratorApi.users.whoami();

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorUser.email!,
        role: "viewer",
      });

      // Remove collaborator
      await ownerApi.lists.removeCollaborator({
        listId: list.id,
        userId: collaboratorUser.id,
      });

      // Verify collaborator was removed
      const { collaborators, owner } = await ownerApi.lists.getCollaborators({
        listId: list.id,
      });

      expect(collaborators).toHaveLength(0);
      expect(owner).toBeDefined();
    });

    test<CustomTestContext>("should include owner information in getCollaborators response", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const ownerUser = await ownerApi.users.whoami();

      const { collaborators, owner } = await ownerApi.lists.getCollaborators({
        listId: list.id,
      });

      // Verify owner information is present
      expect(owner).toBeDefined();
      expect(owner?.id).toBe(ownerUser.id);
      expect(owner?.name).toBe(ownerUser.name);
      expect(owner?.email).toBe(ownerUser.email);

      // List with no collaborators should still have owner
      expect(collaborators).toHaveLength(0);
    });

    test<CustomTestContext>("should remove collaborator's bookmarks when they are removed", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      // Owner adds a bookmark
      const ownerBookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: ownerBookmark.id,
      });

      const collaboratorUser = await collaboratorApi.users.whoami();

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorUser.email!,
        role: "editor",
      });

      // Collaborator adds their own bookmark
      const collabBookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Collaborator's bookmark",
      });

      await collaboratorApi.lists.addToList({
        listId: list.id,
        bookmarkId: collabBookmark.id,
      });

      // Verify both bookmarks are in the list
      const bookmarksBefore = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });
      expect(bookmarksBefore.bookmarks).toHaveLength(2);

      // Remove collaborator
      await ownerApi.lists.removeCollaborator({
        listId: list.id,
        userId: collaboratorUser.id,
      });

      // Verify only owner's bookmark remains in the list
      const bookmarksAfter = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });
      expect(bookmarksAfter.bookmarks).toHaveLength(1);
      expect(bookmarksAfter.bookmarks[0].id).toBe(ownerBookmark.id);

      // Verify collaborator's bookmark still exists (just not in the list)
      const collabBookmarkStillExists =
        await collaboratorApi.bookmarks.getBookmark({
          bookmarkId: collabBookmark.id,
        });
      expect(collabBookmarkStillExists.id).toBe(collabBookmark.id);
    });

    test<CustomTestContext>("should allow collaborator to leave list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator leaves the list
      await collaboratorApi.lists.leaveList({
        listId: list.id,
      });

      // Verify collaborator was removed
      const { collaborators, owner } = await ownerApi.lists.getCollaborators({
        listId: list.id,
      });

      expect(collaborators).toHaveLength(0);
      expect(owner).toBeDefined();

      // Verify list no longer appears in shared lists
      const { lists: allLists } = await collaboratorApi.lists.list();
      const sharedLists = allLists.filter(
        (l) => l.userRole === "viewer" || l.userRole === "editor",
      );
      expect(sharedLists.find((l) => l.id === list.id)).toBeUndefined();
    });

    test<CustomTestContext>("should remove collaborator's bookmarks when they leave list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      // Owner adds a bookmark
      const ownerBookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: ownerBookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator adds their own bookmark
      const collabBookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Collaborator's bookmark",
      });

      await collaboratorApi.lists.addToList({
        listId: list.id,
        bookmarkId: collabBookmark.id,
      });

      // Verify both bookmarks are in the list
      const bookmarksBefore = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });
      expect(bookmarksBefore.bookmarks).toHaveLength(2);

      // Collaborator leaves the list
      await collaboratorApi.lists.leaveList({
        listId: list.id,
      });

      // Verify only owner's bookmark remains in the list
      const bookmarksAfter = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });
      expect(bookmarksAfter.bookmarks).toHaveLength(1);
      expect(bookmarksAfter.bookmarks[0].id).toBe(ownerBookmark.id);

      // Verify collaborator's bookmark still exists (just not in the list)
      const collabBookmarkStillExists =
        await collaboratorApi.bookmarks.getBookmark({
          bookmarkId: collabBookmark.id,
        });
      expect(collabBookmarkStillExists.id).toBe(collabBookmark.id);
    });

    test<CustomTestContext>("should not allow owner to leave their own list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      await expect(
        ownerApi.lists.leaveList({
          listId: list.id,
        }),
      ).rejects.toThrow(
        "List owners cannot leave their own list. Delete the list instead.",
      );
    });

    test<CustomTestContext>("should not allow non-collaborator to manage collaborators", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const thirdUserApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const thirdUser = await thirdUserApi.users.whoami();

      // Third user tries to add themselves as collaborator
      await expect(
        thirdUserApi.lists.addCollaborator({
          listId: list.id,
          email: thirdUser.email!,
          role: "viewer",
        }),
      ).rejects.toThrow("List not found");
    });
  });

  describe("List Access and Visibility", () => {
    test<CustomTestContext>("should show shared list in list endpoint", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const { lists: allLists } = await collaboratorApi.lists.list();
      const sharedLists = allLists.filter(
        (l) => l.userRole === "viewer" || l.userRole === "editor",
      );

      expect(sharedLists).toHaveLength(1);
      expect(sharedLists[0].id).toBe(list.id);
      expect(sharedLists[0].name).toBe("Shared List");
    });

    test<CustomTestContext>("should allow collaborator to get list details", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const retrievedList = await collaboratorApi.lists.get({
        listId: list.id,
      });

      expect(retrievedList.id).toBe(list.id);
      expect(retrievedList.name).toBe("Shared List");
      expect(retrievedList.userRole).toBe("viewer");
    });

    test<CustomTestContext>("should not allow non-collaborator to access list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];
      const thirdUserApi = apiCallers[2];

      const list = await ownerApi.lists.create({
        name: "Private List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      await expect(
        thirdUserApi.lists.get({
          listId: list.id,
        }),
      ).rejects.toThrow("List not found");
    });

    test<CustomTestContext>("should show correct userRole for owner", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];

      const list = await ownerApi.lists.create({
        name: "My List",
        icon: "📚",
        type: "manual",
      });

      const retrievedList = await ownerApi.lists.get({
        listId: list.id,
      });

      expect(retrievedList.userRole).toBe("owner");
    });

    test<CustomTestContext>("should show correct userRole for editor", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      const retrievedList = await collaboratorApi.lists.get({
        listId: list.id,
      });

      expect(retrievedList.userRole).toBe("editor");
    });
  });

  describe("Bookmark Access in Shared Lists", () => {
    test<CustomTestContext>("should allow collaborator to view bookmarks in shared list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      // Owner creates list and bookmark
      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Shared bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Share list with collaborator
      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator fetches bookmarks from shared list
      const bookmarks = await collaboratorApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      expect(bookmarks.bookmarks).toHaveLength(1);
      expect(bookmarks.bookmarks[0].id).toBe(bookmark.id);
    });

    test<CustomTestContext>("should hide owner-specific bookmark state from collaborators", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Shared bookmark",
      });

      await ownerApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        archived: true,
        favourited: true,
        note: "Private note",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const ownerView = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      const collaboratorView = await collaboratorApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      const ownerBookmark = ownerView.bookmarks.find(
        (b) => b.id === bookmark.id,
      );
      expect(ownerBookmark?.favourited).toBe(true);
      expect(ownerBookmark?.archived).toBe(true);
      expect(ownerBookmark?.note).toBe("Private note");

      const collaboratorBookmark = collaboratorView.bookmarks.find(
        (b) => b.id === bookmark.id,
      );
      expect(collaboratorBookmark?.favourited).toBe(false);
      expect(collaboratorBookmark?.archived).toBe(false);
      expect(collaboratorBookmark?.note).toBeNull();
    });

    // Note: Asset handling for shared bookmarks is tested via the REST API in e2e tests
    // This is because tRPC tests don't have easy access to file upload functionality

    test<CustomTestContext>("should allow collaborator to view individual shared bookmark", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Shared bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator gets individual bookmark
      const response = await collaboratorApi.bookmarks.getBookmark({
        bookmarkId: bookmark.id,
      });

      expect(response.id).toBe(bookmark.id);
    });

    test<CustomTestContext>("should not show shared bookmarks on collaborator's homepage", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const sharedBookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Shared bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: sharedBookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator creates their own bookmark
      const ownBookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "My own bookmark",
      });

      // Fetch all bookmarks (no listId filter)
      const allBookmarks = await collaboratorApi.bookmarks.getBookmarks({});

      // Should only see own bookmark, not shared one
      expect(allBookmarks.bookmarks).toHaveLength(1);
      expect(allBookmarks.bookmarks[0].id).toBe(ownBookmark.id);
    });

    test<CustomTestContext>("should not allow non-collaborator to access shared bookmark", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];
      const thirdUserApi = apiCallers[2]; // User 3 will be the non-collaborator

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Shared bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Don't add thirdUserApi as a collaborator
      // Third user tries to access the bookmark
      await expect(
        thirdUserApi.bookmarks.getBookmark({
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow("Bookmark not found");
    });

    test<CustomTestContext>("should show all bookmarks in shared list regardless of owner", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      // Owner adds a bookmark
      const ownerBookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: ownerBookmark.id,
      });

      // Share list with collaborator as editor
      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator adds their own bookmark
      const collabBookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Collaborator's bookmark",
      });

      await collaboratorApi.lists.addToList({
        listId: list.id,
        bookmarkId: collabBookmark.id,
      });

      // Both users should see both bookmarks in the list
      const ownerView = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      const collabView = await collaboratorApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      expect(ownerView.bookmarks).toHaveLength(2);
      expect(collabView.bookmarks).toHaveLength(2);
    });
  });

  describe("Bookmark Editing Permissions", () => {
    test<CustomTestContext>("should not allow viewer to add bookmarks to list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Viewer creates their own bookmark
      const bookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "My bookmark",
      });

      // Viewer tries to add it to shared list
      await expect(
        collaboratorApi.lists.addToList({
          listId: list.id,
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow("User is not allowed to edit this list");
    });

    test<CustomTestContext>("should allow editor to add bookmarks to list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Editor creates their own bookmark
      const bookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "My bookmark",
      });

      // Editor adds it to shared list
      await collaboratorApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Verify bookmark was added
      const bookmarks = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      expect(bookmarks.bookmarks).toHaveLength(1);
      expect(bookmarks.bookmarks[0].id).toBe(bookmark.id);
    });

    test<CustomTestContext>("should not allow viewer to remove bookmarks from list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Test bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Viewer tries to remove bookmark
      await expect(
        collaboratorApi.lists.removeFromList({
          listId: list.id,
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow("User is not allowed to edit this list");
    });

    test<CustomTestContext>("should allow editor to remove bookmarks from list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Test bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Editor removes bookmark
      await collaboratorApi.lists.removeFromList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Verify bookmark was removed
      const bookmarks = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      expect(bookmarks.bookmarks).toHaveLength(0);
    });

    test<CustomTestContext>("should not allow collaborator to edit bookmark they don't own", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to edit owner's bookmark
      await expect(
        collaboratorApi.bookmarks.updateBookmark({
          bookmarkId: bookmark.id,
          title: "Modified title",
        }),
      ).rejects.toThrow("User is not allowed to access resource");
    });

    test<CustomTestContext>("should not allow collaborator to delete bookmark they don't own", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to delete owner's bookmark
      await expect(
        collaboratorApi.bookmarks.deleteBookmark({
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow("User is not allowed to access resource");
    });
  });

  describe("List Management Permissions", () => {
    test<CustomTestContext>("should not allow collaborator to edit list metadata", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to edit list
      await expect(
        collaboratorApi.lists.edit({
          listId: list.id,
          name: "Modified Name",
        }),
      ).rejects.toThrow("User is not allowed to manage this list");
    });

    test<CustomTestContext>("should not allow collaborator to delete list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to delete list
      await expect(
        collaboratorApi.lists.delete({
          listId: list.id,
        }),
      ).rejects.toThrow("User is not allowed to manage this list");
    });

    test<CustomTestContext>("should not allow collaborator to manage other collaborators", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];
      const thirdUserApi = apiCallers[2];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      const thirdUserEmail = (await thirdUserApi.users.whoami()).email!;

      // Collaborator tries to add another user
      await expect(
        collaboratorApi.lists.addCollaborator({
          listId: list.id,
          email: thirdUserEmail,
          role: "viewer",
        }),
      ).rejects.toThrow("User is not allowed to manage this list");
    });

    test<CustomTestContext>("should only allow collaborators to view collaborator list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];
      const thirdUserApi = apiCallers[2];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator can view collaborators
      const { collaborators, owner } =
        await collaboratorApi.lists.getCollaborators({
          listId: list.id,
        });

      expect(collaborators).toHaveLength(1);
      expect(owner).toBeDefined();

      // Non-collaborator cannot view
      await expect(
        thirdUserApi.lists.getCollaborators({
          listId: list.id,
        }),
      ).rejects.toThrow("List not found");
    });
  });

  describe("Access After Removal", () => {
    test<CustomTestContext>("should revoke access after removing collaborator", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Shared bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorUser = await collaboratorApi.users.whoami();
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorUser.email!,
        role: "viewer",
      });

      // Verify collaborator has access to list
      const bookmarksBefore = await collaboratorApi.bookmarks.getBookmarks({
        listId: list.id,
      });
      expect(bookmarksBefore.bookmarks).toHaveLength(1);

      // Verify collaborator has access to individual bookmark
      const bookmarkBefore = await collaboratorApi.bookmarks.getBookmark({
        bookmarkId: bookmark.id,
      });
      expect(bookmarkBefore.id).toBe(bookmark.id);

      // Remove collaborator
      await ownerApi.lists.removeCollaborator({
        listId: list.id,
        userId: collaboratorUser.id,
      });

      // Verify list access is revoked
      await expect(
        collaboratorApi.bookmarks.getBookmarks({
          listId: list.id,
        }),
      ).rejects.toThrow("List not found");

      // Verify bookmark access is revoked
      await expect(
        collaboratorApi.bookmarks.getBookmark({
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow("Bookmark not found");
    });

    test<CustomTestContext>("should revoke access after leaving list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator leaves
      await collaboratorApi.lists.leaveList({
        listId: list.id,
      });

      // Verify access is revoked
      await expect(
        collaboratorApi.lists.get({
          listId: list.id,
        }),
      ).rejects.toThrow("List not found");
    });
  });

  describe("Smart Lists", () => {
    test<CustomTestContext>("should not allow adding collaborators to smart lists", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Smart List",
        icon: "🔍",
        type: "smart",
        query: "is:fav",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await expect(
        ownerApi.lists.addCollaborator({
          listId: list.id,
          email: collaboratorEmail,
          role: "viewer",
        }),
      ).rejects.toThrow("Only manual lists can have collaborators");
    });
  });

  describe("List Operations Privacy", () => {
    test<CustomTestContext>("should not allow collaborator to merge lists", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list1 = await ownerApi.lists.create({
        name: "List 1",
        icon: "📚",
        type: "manual",
      });

      const list2 = await ownerApi.lists.create({
        name: "List 2",
        icon: "📖",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list1.id,
        email: collaboratorEmail,
        role: "editor",
      });
      await ownerApi.lists.addCollaborator({
        listId: list2.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to merge the shared list into another list
      await expect(
        collaboratorApi.lists.merge({
          sourceId: list1.id,
          targetId: list2.id,
          deleteSourceAfterMerge: false,
        }),
      ).rejects.toThrow("User is not allowed to manage this list");
    });

    test<CustomTestContext>("should not allow collaborator to access RSS token operations", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to generate RSS token
      await expect(
        collaboratorApi.lists.regenRssToken({
          listId: list.id,
        }),
      ).rejects.toThrow("User is not allowed to manage this list");

      // Collaborator tries to get RSS token
      await expect(
        collaboratorApi.lists.getRssToken({
          listId: list.id,
        }),
      ).rejects.toThrow("User is not allowed to manage this list");

      // Owner generates token first
      await ownerApi.lists.regenRssToken({
        listId: list.id,
      });

      // Collaborator tries to clear RSS token
      await expect(
        collaboratorApi.lists.clearRssToken({
          listId: list.id,
        }),
      ).rejects.toThrow("User is not allowed to manage this list");
    });

    test<CustomTestContext>("should not allow collaborator to access getListsOfBookmark for bookmark they don't own", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator cannot use getListsOfBookmark for owner's bookmark
      // This is expected - only bookmark owners can query which lists contain their bookmarks
      await expect(
        collaboratorApi.lists.getListsOfBookmark({
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("should allow collaborator to use getListsOfBookmark for their own bookmarks in shared lists", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator creates their own bookmark and adds it to the shared list
      const bookmark = await collaboratorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Collaborator's bookmark",
      });

      await collaboratorApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Collaborator can see the shared list in getListsOfBookmark for their own bookmark
      const { lists } = await collaboratorApi.lists.getListsOfBookmark({
        bookmarkId: bookmark.id,
      });

      expect(lists).toHaveLength(1);
      expect(lists[0].id).toBe(list.id);
      expect(lists[0].userRole).toBe("editor");
      expect(lists[0].hasCollaborators).toBe(true);
    });

    test<CustomTestContext>("should show hasCollaborators=true for owner when their bookmark is in a list with collaborators", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      // Owner creates a list
      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      // Owner creates and adds a bookmark
      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Add a collaborator
      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Owner queries which lists contain their bookmark
      const { lists } = await ownerApi.lists.getListsOfBookmark({
        bookmarkId: bookmark.id,
      });

      expect(lists).toHaveLength(1);
      expect(lists[0].id).toBe(list.id);
      expect(lists[0].userRole).toBe("owner");
      expect(lists[0].hasCollaborators).toBe(true);
    });

    test<CustomTestContext>("should show hasCollaborators=false for owner when their bookmark is in a list without collaborators", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];

      // Owner creates a list
      const list = await ownerApi.lists.create({
        name: "Private List",
        icon: "📚",
        type: "manual",
      });

      // Owner creates and adds a bookmark
      const bookmark = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Owner's bookmark",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Owner queries which lists contain their bookmark
      const { lists } = await ownerApi.lists.getListsOfBookmark({
        bookmarkId: bookmark.id,
      });

      expect(lists).toHaveLength(1);
      expect(lists[0].id).toBe(list.id);
      expect(lists[0].userRole).toBe("owner");
      expect(lists[0].hasCollaborators).toBe(false);
    });

    test<CustomTestContext>("should include shared lists in stats", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      // Add bookmarks to the list
      const bookmark1 = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Bookmark 1",
      });
      const bookmark2 = await ownerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Bookmark 2",
      });

      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark1.id,
      });
      await ownerApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark2.id,
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator gets stats
      const { stats } = await collaboratorApi.lists.stats();

      // Shared list should appear in stats with correct count
      expect(stats.get(list.id)).toBe(2);
    });

    test<CustomTestContext>("should allow editor to add their own bookmark to shared list via addToList", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const editorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const editorEmail = (await editorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: editorEmail,
        role: "editor",
      });

      // Editor creates their own bookmark
      const bookmark = await editorApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Editor's bookmark",
      });

      // Editor should be able to add their bookmark to the shared list
      await editorApi.lists.addToList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      // Verify bookmark was added
      const bookmarks = await ownerApi.bookmarks.getBookmarks({
        listId: list.id,
      });

      expect(bookmarks.bookmarks).toHaveLength(1);
      expect(bookmarks.bookmarks[0].id).toBe(bookmark.id);
    });

    test<CustomTestContext>("should not allow viewer to add their own bookmark to shared list via addToList", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const viewerApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const viewerEmail = (await viewerApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: viewerEmail,
        role: "viewer",
      });

      // Viewer creates their own bookmark
      const bookmark = await viewerApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Viewer's bookmark",
      });

      // Viewer should not be able to add their bookmark to the shared list
      await expect(
        viewerApi.lists.addToList({
          listId: list.id,
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow();
    });

    test<CustomTestContext>("should not allow editor to add someone else's bookmark to shared list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const editorApi = apiCallers[1];
      const thirdUserApi = apiCallers[2];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const editorEmail = (await editorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: editorEmail,
        role: "editor",
      });

      // Third user creates a bookmark (or owner if only 2 users)
      const bookmark = await thirdUserApi.bookmarks.createBookmark({
        type: BookmarkTypes.TEXT,
        text: "Someone else's bookmark",
      });

      // Editor should not be able to add someone else's bookmark
      await expect(
        editorApi.lists.addToList({
          listId: list.id,
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow(/Bookmark not found/);
    });

    test<CustomTestContext>("should not allow collaborator to update list metadata fields", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const editorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const editorEmail = (await editorApi.users.whoami()).email!;
      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: editorEmail,
        role: "editor",
      });

      // Editor tries to change list name
      await expect(
        editorApi.lists.edit({
          listId: list.id,
          name: "Modified Name",
        }),
      ).rejects.toThrow();

      // Editor tries to make list public
      await expect(
        editorApi.lists.edit({
          listId: list.id,
          public: true,
        }),
      ).rejects.toThrow();
    });
  });

  describe("hasCollaborators Field", () => {
    test<CustomTestContext>("should be false for newly created list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];

      const list = await ownerApi.lists.create({
        name: "New List",
        icon: "📚",
        type: "manual",
      });

      expect(list.hasCollaborators).toBe(false);
    });

    test<CustomTestContext>("should be true for owner after adding a collaborator", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Fetch the list again to get updated hasCollaborators
      const updatedList = await ownerApi.lists.get({
        listId: list.id,
      });

      expect(updatedList.hasCollaborators).toBe(true);
    });

    test<CustomTestContext>("should be true for collaborator viewing shared list", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator fetches the list
      const sharedList = await collaboratorApi.lists.get({
        listId: list.id,
      });

      expect(sharedList.hasCollaborators).toBe(true);
    });

    test<CustomTestContext>("should be false for owner after removing all collaborators", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorUser = await collaboratorApi.users.whoami();

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorUser.email!,
        role: "viewer",
      });

      // Remove the collaborator
      await ownerApi.lists.removeCollaborator({
        listId: list.id,
        userId: collaboratorUser.id,
      });

      // Fetch the list again
      const updatedList = await ownerApi.lists.get({
        listId: list.id,
      });

      expect(updatedList.hasCollaborators).toBe(false);
    });

    test<CustomTestContext>("should show correct value in lists.list() endpoint", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      // Create list without collaborators
      const list1 = await ownerApi.lists.create({
        name: "Private List",
        icon: "🔒",
        type: "manual",
      });

      // Create list with collaborators
      const list2 = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list2.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Get all lists
      const { lists } = await ownerApi.lists.list();

      const privateList = lists.find((l) => l.id === list1.id);
      const sharedList = lists.find((l) => l.id === list2.id);

      expect(privateList?.hasCollaborators).toBe(false);
      expect(sharedList?.hasCollaborators).toBe(true);
    });

    test<CustomTestContext>("should show true for collaborator in lists.list() endpoint", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];

      const list = await ownerApi.lists.create({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const collaboratorEmail = (await collaboratorApi.users.whoami()).email!;

      await ownerApi.lists.addCollaborator({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator gets all lists
      const { lists } = await collaboratorApi.lists.list();

      const sharedList = lists.find((l) => l.id === list.id);

      expect(sharedList?.hasCollaborators).toBe(true);
      expect(sharedList?.userRole).toBe("editor");
    });
  });
});
