import { beforeEach, describe, expect, inject, it } from "vitest";

import { createKarakeepClient } from "@karakeep/sdk";

import { createTestUser, uploadTestAsset } from "../../utils/api";
import { getTrpcClient } from "../../utils/trpc";

describe("Shared Lists API", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  // We'll create two users: owner and collaborator
  let ownerClient: ReturnType<typeof createKarakeepClient>;
  let ownerApiKey: string;
  let ownerTrpc: ReturnType<typeof getTrpcClient>;

  let collaboratorClient: ReturnType<typeof createKarakeepClient>;
  let collaboratorApiKey: string;
  let collaboratorTrpc: ReturnType<typeof getTrpcClient>;
  let collaboratorEmail: string;

  let thirdUserClient: ReturnType<typeof createKarakeepClient>;
  let thirdUserApiKey: string;
  let thirdUserTrpc: ReturnType<typeof getTrpcClient>;

  beforeEach(async () => {
    // Create owner user
    ownerApiKey = await createTestUser();
    ownerClient = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${ownerApiKey}`,
      },
    });
    ownerTrpc = getTrpcClient(ownerApiKey);

    // Create collaborator user
    collaboratorApiKey = await createTestUser();
    collaboratorClient = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${collaboratorApiKey}`,
      },
    });
    collaboratorTrpc = getTrpcClient(collaboratorApiKey);
    // Get collaborator email for sharing
    const collaboratorUser = await collaboratorTrpc.users.whoami.query();
    collaboratorEmail = collaboratorUser.email!;

    // Create third user (for negative tests)
    thirdUserApiKey = await createTestUser();
    thirdUserClient = createKarakeepClient({
      baseUrl: `http://localhost:${port}/api/v1/`,
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${thirdUserApiKey}`,
      },
    });
    thirdUserTrpc = getTrpcClient(thirdUserApiKey);
  });

  describe("List Collaboration Management", () => {
    it("should allow owner to add a collaborator by email", async () => {
      // Create a list as owner
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test Shared List",
        icon: "📚",
        type: "manual",
      });

      // Add collaborator
      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Verify collaborator was added
      const { collaborators } = await ownerTrpc.lists.getCollaborators.query({
        listId: list.id,
      });

      expect(collaborators).toHaveLength(1);
      expect(collaborators[0].user.email).toBe(collaboratorEmail);
      expect(collaborators[0].role).toBe("viewer");
    });

    it("should not allow adding owner as collaborator", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const ownerUser = await ownerTrpc.users.whoami.query();

      await expect(
        ownerTrpc.lists.addCollaborator.mutate({
          listId: list.id,
          email: ownerUser.email!,
          role: "viewer",
        }),
      ).rejects.toThrow();
    });

    it("should not allow adding duplicate collaborator", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Try to add same collaborator again
      await expect(
        ownerTrpc.lists.addCollaborator.mutate({
          listId: list.id,
          email: collaboratorEmail,
          role: "editor",
        }),
      ).rejects.toThrow();
    });

    it("should allow owner to update collaborator role", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const collaboratorUser = await collaboratorTrpc.users.whoami.query();

      // Update role to editor
      await ownerTrpc.lists.updateCollaboratorRole.mutate({
        listId: list.id,
        userId: collaboratorUser.id,
        role: "editor",
      });

      // Verify role was updated
      const { collaborators } = await ownerTrpc.lists.getCollaborators.query({
        listId: list.id,
      });

      expect(collaborators[0].role).toBe("editor");
    });

    it("should allow owner to remove collaborator", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const collaboratorUser = await collaboratorTrpc.users.whoami.query();

      // Remove collaborator
      await ownerTrpc.lists.removeCollaborator.mutate({
        listId: list.id,
        userId: collaboratorUser.id,
      });

      // Verify collaborator was removed
      const { collaborators } = await ownerTrpc.lists.getCollaborators.query({
        listId: list.id,
      });

      expect(collaborators).toHaveLength(0);
    });

    it("should allow collaborator to leave list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator leaves the list
      await collaboratorTrpc.lists.leaveList.mutate({
        listId: list.id,
      });

      // Verify collaborator was removed
      const { collaborators } = await ownerTrpc.lists.getCollaborators.query({
        listId: list.id,
      });

      expect(collaborators).toHaveLength(0);

      // Verify list no longer appears in shared lists
      const { lists: sharedLists } =
        await collaboratorTrpc.lists.getSharedWithMe.query();
      expect(sharedLists.find((l) => l.id === list.id)).toBeUndefined();
    });

    it("should not allow owner to leave their own list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      await expect(
        ownerTrpc.lists.leaveList.mutate({
          listId: list.id,
        }),
      ).rejects.toThrow();
    });

    it("should not allow non-collaborator to manage collaborators", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Test List",
        icon: "📚",
        type: "manual",
      });

      const thirdUser = await thirdUserTrpc.users.whoami.query();

      // Third user tries to add themselves as collaborator
      await expect(
        thirdUserTrpc.lists.addCollaborator.mutate({
          listId: list.id,
          email: thirdUser.email!,
          role: "viewer",
        }),
      ).rejects.toThrow();
    });
  });

  describe("List Access and Visibility", () => {
    it("should show shared list in getSharedWithMe", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const { lists: sharedLists } =
        await collaboratorTrpc.lists.getSharedWithMe.query();

      expect(sharedLists).toHaveLength(1);
      expect(sharedLists[0].id).toBe(list.id);
      expect(sharedLists[0].name).toBe("Shared List");
    });

    it("should allow collaborator to get list details", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const retrievedList = await collaboratorTrpc.lists.get.query({
        listId: list.id,
      });

      expect(retrievedList.id).toBe(list.id);
      expect(retrievedList.name).toBe("Shared List");
      expect(retrievedList.userRole).toBe("viewer");
    });

    it("should not allow non-collaborator to access list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Private List",
        icon: "📚",
        type: "manual",
      });

      await expect(
        thirdUserTrpc.lists.get.query({
          listId: list.id,
        }),
      ).rejects.toThrow();
    });

    it("should show correct userRole for owner", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "My List",
        icon: "📚",
        type: "manual",
      });

      const retrievedList = await ownerTrpc.lists.get.query({
        listId: list.id,
      });

      expect(retrievedList.userRole).toBe("owner");
    });

    it("should show correct userRole for editor", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      const retrievedList = await collaboratorTrpc.lists.get.query({
        listId: list.id,
      });

      expect(retrievedList.userRole).toBe("editor");
    });
  });

  describe("Bookmark Access in Shared Lists", () => {
    it("should allow collaborator to view bookmarks in shared list", async () => {
      // Owner creates list and bookmark
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Shared bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      // Share list with collaborator
      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator fetches bookmarks from shared list
      const { data: bookmarks } = await collaboratorClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      expect(bookmarks?.bookmarks).toHaveLength(1);
      expect(bookmarks?.bookmarks[0].id).toBe(bookmark!.id);
    });

    it("should hide owner-specific bookmark state from collaborators", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Shared bookmark",
          archived: true,
          favourited: true,
          note: "Private note",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const { data: ownerView } = await ownerClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      const { data: collaboratorView } = await collaboratorClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      const ownerBookmark = ownerView?.bookmarks.find(
        (b) => b.id === bookmark!.id,
      );
      expect(ownerBookmark?.favourited).toBe(true);
      expect(ownerBookmark?.archived).toBe(true);
      expect(ownerBookmark?.note).toBe("Private note");

      const collaboratorBookmark = collaboratorView?.bookmarks.find(
        (b) => b.id === bookmark!.id,
      );
      expect(collaboratorBookmark?.favourited).toBe(false);
      expect(collaboratorBookmark?.archived).toBe(false);
      expect(collaboratorBookmark?.note).toBeNull();
    });

    it("should allow collaborators to fetch assets from shared bookmarks", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const file = new File(["shared asset"], "shared.pdf", {
        type: "application/pdf",
      });
      const uploadResponse = await uploadTestAsset(ownerApiKey, port, file);

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "asset",
          title: "Shared asset",
          assetType: "pdf",
          assetId: uploadResponse.assetId,
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      const collaboratorResp = await fetch(
        `http://localhost:${port}/api/v1/assets/${uploadResponse.assetId}`,
        {
          headers: {
            authorization: `Bearer ${collaboratorApiKey}`,
          },
        },
      );
      expect(collaboratorResp.status).toBe(200);

      const thirdResp = await fetch(
        `http://localhost:${port}/api/v1/assets/${uploadResponse.assetId}`,
        {
          headers: {
            authorization: `Bearer ${thirdUserApiKey}`,
          },
        },
      );
      expect(thirdResp.status).toBe(404);
    });

    it("should allow collaborator to view individual shared bookmark", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Shared bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator gets individual bookmark
      const response = await collaboratorClient.GET("/bookmarks/{bookmarkId}", {
        params: {
          path: {
            bookmarkId: bookmark!.id,
          },
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.data?.id).toBe(bookmark!.id);
    });

    it("should not show shared bookmarks on collaborator's homepage", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: sharedBookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Shared bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: sharedBookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator creates their own bookmark
      const { data: ownBookmark } = await collaboratorClient.POST(
        "/bookmarks",
        {
          body: {
            type: "text",
            text: "My own bookmark",
          },
        },
      );

      // Fetch all bookmarks (no listId filter)
      const { data: allBookmarks } = await collaboratorClient.GET("/bookmarks");

      // Should only see own bookmark, not shared one
      expect(allBookmarks?.bookmarks).toHaveLength(1);
      expect(allBookmarks?.bookmarks[0].id).toBe(ownBookmark!.id);
    });

    it("should not allow non-collaborator to access shared bookmark", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Shared bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Third user tries to access the bookmark
      const response = await thirdUserClient.GET("/bookmarks/{bookmarkId}", {
        params: {
          path: {
            bookmarkId: bookmark!.id,
          },
        },
      });

      expect(response.error).toBeDefined();
    });

    it("should show all bookmarks in shared list regardless of owner", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      // Owner adds a bookmark
      const { data: ownerBookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Owner's bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: ownerBookmark!.id,
      });

      // Share list with collaborator as editor
      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator adds their own bookmark
      const { data: collabBookmark } = await collaboratorClient.POST(
        "/bookmarks",
        {
          body: {
            type: "text",
            text: "Collaborator's bookmark",
          },
        },
      );

      await collaboratorTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: collabBookmark!.id,
      });

      // Both users should see both bookmarks in the list
      const { data: ownerView } = await ownerClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      const { data: collabView } = await collaboratorClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      expect(ownerView?.bookmarks).toHaveLength(2);
      expect(collabView?.bookmarks).toHaveLength(2);
    });
  });

  describe("Bookmark Editing Permissions", () => {
    it("should not allow viewer to add bookmarks to list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Viewer creates their own bookmark
      const { data: bookmark } = await collaboratorClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "My bookmark",
        },
      });

      // Viewer tries to add it to shared list
      await expect(
        collaboratorTrpc.lists.addToList.mutate({
          listId: list.id,
          bookmarkId: bookmark!.id,
        }),
      ).rejects.toThrow();
    });

    it("should allow editor to add bookmarks to list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Editor creates their own bookmark
      const { data: bookmark } = await collaboratorClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "My bookmark",
        },
      });

      // Editor adds it to shared list
      await collaboratorTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      // Verify bookmark was added
      const { data: bookmarks } = await ownerClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      expect(bookmarks?.bookmarks).toHaveLength(1);
      expect(bookmarks?.bookmarks[0].id).toBe(bookmark!.id);
    });

    it("should not allow viewer to remove bookmarks from list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Test bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Viewer tries to remove bookmark
      await expect(
        collaboratorTrpc.lists.removeFromList.mutate({
          listId: list.id,
          bookmarkId: bookmark!.id,
        }),
      ).rejects.toThrow();
    });

    it("should allow editor to remove bookmarks from list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Test bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Editor removes bookmark
      await collaboratorTrpc.lists.removeFromList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      // Verify bookmark was removed
      const { data: bookmarks } = await ownerClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );

      expect(bookmarks?.bookmarks).toHaveLength(0);
    });

    it("should not allow collaborator to edit bookmark they don't own", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Owner's bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to edit owner's bookmark
      const response = await collaboratorClient.PATCH(
        "/bookmarks/{bookmarkId}",
        {
          params: {
            path: {
              bookmarkId: bookmark!.id,
            },
          },
          body: {
            title: "Modified title",
          },
        },
      );

      expect(response.error).toBeDefined();
    });

    it("should not allow collaborator to delete bookmark they don't own", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Owner's bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to delete owner's bookmark
      const response = await collaboratorClient.DELETE(
        "/bookmarks/{bookmarkId}",
        {
          params: {
            path: {
              bookmarkId: bookmark!.id,
            },
          },
        },
      );

      expect(response.error).toBeDefined();
    });
  });

  describe("List Management Permissions", () => {
    it("should not allow collaborator to edit list metadata", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to edit list
      await expect(
        collaboratorTrpc.lists.edit.mutate({
          listId: list.id,
          name: "Modified Name",
        }),
      ).rejects.toThrow();
    });

    it("should not allow collaborator to delete list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      // Collaborator tries to delete list
      await expect(
        collaboratorTrpc.lists.delete.mutate({
          listId: list.id,
        }),
      ).rejects.toThrow();
    });

    it("should not allow collaborator to manage other collaborators", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "editor",
      });

      const thirdUser = await thirdUserTrpc.users.whoami.query();

      // Collaborator tries to add another user
      await expect(
        collaboratorTrpc.lists.addCollaborator.mutate({
          listId: list.id,
          email: thirdUser.email!,
          role: "viewer",
        }),
      ).rejects.toThrow();
    });

    it("should only allow collaborators to view collaborator list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator can view collaborators
      const { collaborators } =
        await collaboratorTrpc.lists.getCollaborators.query({
          listId: list.id,
        });

      expect(collaborators).toHaveLength(1);

      // Non-collaborator cannot view
      await expect(
        thirdUserTrpc.lists.getCollaborators.query({
          listId: list.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Access After Removal", () => {
    it("should revoke access after removing collaborator", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      const { data: bookmark } = await ownerClient.POST("/bookmarks", {
        body: {
          type: "text",
          text: "Shared bookmark",
        },
      });

      await ownerTrpc.lists.addToList.mutate({
        listId: list.id,
        bookmarkId: bookmark!.id,
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Verify collaborator has access
      const { data: bookmarksBefore } = await collaboratorClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );
      expect(bookmarksBefore?.bookmarks).toHaveLength(1);

      // Remove collaborator
      const collaboratorUser = await collaboratorTrpc.users.whoami.query();
      await ownerTrpc.lists.removeCollaborator.mutate({
        listId: list.id,
        userId: collaboratorUser.id,
      });

      // Verify access is revoked
      const listResponse = await collaboratorClient.GET(
        "/lists/{listId}/bookmarks",
        {
          params: {
            path: {
              listId: list.id,
            },
          },
        },
      );
      expect(listResponse.error).toBeDefined();

      const bookmarkResponse = await collaboratorClient.GET(
        "/bookmarks/{bookmarkId}",
        {
          params: {
            path: {
              bookmarkId: bookmark!.id,
            },
          },
        },
      );
      expect(bookmarkResponse.error).toBeDefined();
    });

    it("should revoke access after leaving list", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Shared List",
        icon: "📚",
        type: "manual",
      });

      await ownerTrpc.lists.addCollaborator.mutate({
        listId: list.id,
        email: collaboratorEmail,
        role: "viewer",
      });

      // Collaborator leaves
      await collaboratorTrpc.lists.leaveList.mutate({
        listId: list.id,
      });

      // Verify access is revoked
      await expect(
        collaboratorTrpc.lists.get.query({
          listId: list.id,
        }),
      ).rejects.toThrow();
    });
  });

  describe("Smart Lists", () => {
    it("should not allow adding collaborators to smart lists", async () => {
      const list = await ownerTrpc.lists.create.mutate({
        name: "Smart List",
        icon: "🔍",
        type: "smart",
        query: "is:fav",
      });

      await expect(
        ownerTrpc.lists.addCollaborator.mutate({
          listId: list.id,
          email: collaboratorEmail,
          role: "viewer",
        }),
      ).rejects.toThrow();
    });
  });
});
