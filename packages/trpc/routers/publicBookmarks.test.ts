import { beforeEach, describe, expect, test } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { CustomTestContext } from "../testUtils";
import { defaultBeforeEach } from "../testUtils";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

describe("Public bookmark sharing", () => {
  test<CustomTestContext>("bookmarks are not shared by default", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].bookmarks;
    const bookmark = await api.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "hello",
    });

    const share = await api.getPublicShare({ bookmarkId: bookmark.id });
    expect(share.token).toBeNull();
  });

  test<CustomTestContext>("owner can share a bookmark publicly", async ({
    apiCallers,
    unauthedAPICaller,
  }) => {
    const api = apiCallers[0].bookmarks;
    const bookmark = await api.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "hello world",
      title: "My text",
      note: "private note",
    });
    await api.updateTags({
      bookmarkId: bookmark.id,
      attach: [{ tagName: "tag1" }],
      detach: [],
    });

    const { token } = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: true,
    });
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await api.getPublicShare({ bookmarkId: bookmark.id })).toEqual({
      token,
    });

    const res = await unauthedAPICaller.publicBookmarks.getPublicBookmark({
      token: token!,
    });
    expect(res.ownerName).toBe("Test User 1");
    expect(res.bookmark.id).toBe(bookmark.id);
    expect(res.bookmark.title).toBe("My text");
    expect(res.bookmark.tags).toEqual(["tag1"]);
    expect(res.bookmark.content).toEqual({
      type: BookmarkTypes.TEXT,
      text: "hello world",
    });
    // Same exposure rules as public lists: no notes or other private fields.
    expect(res.bookmark).not.toHaveProperty("note");
    expect(res.bookmark).not.toHaveProperty("userId");
  });

  test<CustomTestContext>("sharing an already shared bookmark keeps the link", async ({
    apiCallers,
  }) => {
    const api = apiCallers[0].bookmarks;
    const bookmark = await api.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com",
    });

    const first = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: true,
    });
    const second = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: true,
    });
    expect(second.token).toBe(first.token);
  });

  test<CustomTestContext>("disabling the share revokes the link", async ({
    apiCallers,
    unauthedAPICaller,
  }) => {
    const api = apiCallers[0].bookmarks;
    const bookmark = await api.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com",
    });
    const { token: oldToken } = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: true,
    });

    const disabled = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: false,
    });
    expect(disabled.token).toBeNull();
    await expect(
      unauthedAPICaller.publicBookmarks.getPublicBookmark({
        token: oldToken!,
      }),
    ).rejects.toThrow("Bookmark not found");

    // Re-sharing generates a new link, the old one stays dead.
    const { token: newToken } = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: true,
    });
    expect(newToken).not.toBe(oldToken);
    await expect(
      unauthedAPICaller.publicBookmarks.getPublicBookmark({
        token: oldToken!,
      }),
    ).rejects.toThrow("Bookmark not found");
    const res = await unauthedAPICaller.publicBookmarks.getPublicBookmark({
      token: newToken!,
    });
    expect(res.bookmark.content).toEqual({
      type: BookmarkTypes.LINK,
      url: "https://example.com",
    });
  });

  test<CustomTestContext>("unknown tokens are not found", async ({
    unauthedAPICaller,
  }) => {
    await expect(
      unauthedAPICaller.publicBookmarks.getPublicBookmark({
        token: "doesnotexist",
      }),
    ).rejects.toThrow("Bookmark not found");
  });

  test<CustomTestContext>("deleting the bookmark revokes the link", async ({
    apiCallers,
    unauthedAPICaller,
  }) => {
    const api = apiCallers[0].bookmarks;
    const bookmark = await api.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "hello",
    });
    const { token } = await api.setPublicShare({
      bookmarkId: bookmark.id,
      enabled: true,
    });
    await api.deleteBookmark({ bookmarkId: bookmark.id });

    await expect(
      unauthedAPICaller.publicBookmarks.getPublicBookmark({
        token: token!,
      }),
    ).rejects.toThrow("Bookmark not found");
  });

  test<CustomTestContext>("only the owner can manage the share", async ({
    apiCallers,
  }) => {
    const ownerApi = apiCallers[0];
    const otherApi = apiCallers[1];
    const bookmark = await ownerApi.bookmarks.createBookmark({
      type: BookmarkTypes.TEXT,
      text: "hello",
    });

    await expect(
      otherApi.bookmarks.getPublicShare({ bookmarkId: bookmark.id }),
    ).rejects.toThrow();
    await expect(
      otherApi.bookmarks.setPublicShare({
        bookmarkId: bookmark.id,
        enabled: true,
      }),
    ).rejects.toThrow();

    // Collaborators with access to the bookmark can't share it either.
    const list = await ownerApi.lists.create({
      name: "Shared",
      icon: "📚",
      type: "manual",
    });
    await ownerApi.lists.addToList({
      listId: list.id,
      bookmarkId: bookmark.id,
    });
    const otherUser = await otherApi.users.whoami();
    const { invitationId } = await ownerApi.lists.addCollaborator({
      listId: list.id,
      email: otherUser.email!,
      role: "editor",
    });
    await otherApi.lists.acceptInvitation({ invitationId });

    await expect(
      otherApi.bookmarks.setPublicShare({
        bookmarkId: bookmark.id,
        enabled: true,
      }),
    ).rejects.toThrow("User is not allowed to access resource");
    expect(
      await ownerApi.bookmarks.getPublicShare({ bookmarkId: bookmark.id }),
    ).toEqual({ token: null });
  });
});
