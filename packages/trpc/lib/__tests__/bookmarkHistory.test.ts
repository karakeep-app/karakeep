import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PENDING_EDITS_TABLE } from "@karakeep/db/pendingHistory";
import { bookmarkEditHistory, bookmarks } from "@karakeep/db/schema";
import type { ZBookmark } from "@karakeep/shared/types/bookmarks";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import type { APICallerType, CustomTestContext } from "../../testUtils";
import { defaultBeforeEach } from "../../testUtils";
import { NOTE_COALESCE_WINDOW_MS } from "../bookmarkHistory";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

afterEach(() => {
  vi.useRealTimers();
});

function assertLinkDescription(bookmark: ZBookmark, expected: string | null) {
  if (bookmark.content.type !== BookmarkTypes.LINK) {
    throw new Error("Expected a link bookmark");
  }
  expect(bookmark.content.description ?? null).toEqual(expected);
}

async function createTextBookmark(api: APICallerType) {
  return await api.bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "Some text",
  });
}

async function shareWithCollaborator(
  ownerApi: APICallerType,
  collaboratorApi: APICallerType,
  bookmarkId: string,
  role: "viewer" | "editor",
) {
  const list = await ownerApi.lists.create({
    name: "Shared",
    icon: "📚",
    type: "manual",
  });
  await ownerApi.lists.addToList({ listId: list.id, bookmarkId });
  const collaborator = await collaboratorApi.users.whoami();
  const { invitationId } = await ownerApi.lists.addCollaborator({
    listId: list.id,
    email: collaborator.email!,
    role,
  });
  await collaboratorApi.lists.acceptInvitation({ invitationId });
}

describe("Bookmark edit history", () => {
  describe("capturing changes", () => {
    test<CustomTestContext>("records the field, old value, new value, editor and time", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      const before = Date.now();
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "First title",
      });

      const { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        field: "title",
        oldValue: null,
        newValue: "First title",
        editor: { name: "Test User 1" },
      });
      expect(entries[0].editor.id).toEqual((await api.users.whoami()).id);
      expect(entries[0].createdAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    test<CustomTestContext>("records link fields and lists entries newest first", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await api.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com",
      });

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        description: "A description",
      });
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        url: "https://example.org",
        favourited: true,
      });

      const { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries.map((e) => [e.field, e.oldValue, e.newValue])).toEqual([
        ["favourited", false, true],
        ["url", "https://example.com", "https://example.org"],
        ["description", null, "A description"],
      ]);
    });

    test<CustomTestContext>("a no-op update creates no history", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await api.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com",
      });

      // Only the id.
      await api.bookmarks.updateBookmark({ bookmarkId: bookmark.id });
      // What the edit dialog submits when nothing was changed: the displayed
      // title (the url, as nothing was crawled), "" for empty fields, and the
      // current flags.
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "https://example.com",
        url: "https://example.com",
        description: "",
        author: "",
        publisher: "",
        summary: null,
        archived: false,
        favourited: false,
      });

      const { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries).toEqual([]);
    });

    test<CustomTestContext>("a failed update leaves no history", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      await expect(
        api.bookmarks.updateBookmark({
          bookmarkId: bookmark.id,
          title: "Would change",
          url: "https://example.com",
        }),
      ).rejects.toThrow(/non-link type bookmark/);

      const { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries).toEqual([]);
    });

    test<CustomTestContext>("merges note autosaves into one entry", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      for (const note of ["H", "He", "Hello"]) {
        await api.bookmarks.updateBookmark({ bookmarkId: bookmark.id, note });
      }
      let { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        field: "note",
        oldValue: null,
        newValue: "Hello",
      });

      // Typing it back to the original value leaves no entry at all.
      await api.bookmarks.updateBookmark({ bookmarkId: bookmark.id, note: "" });
      ({ entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      }));
      expect(entries).toEqual([]);
    });

    test<CustomTestContext>("note edits further apart are separate entries", async ({
      apiCallers,
    }) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const start = new Date("2026-01-01T10:00:00.000Z");
      vi.setSystemTime(start);

      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        note: "First",
      });

      vi.setSystemTime(start.getTime() + NOTE_COALESCE_WINDOW_MS + 1000);
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        note: "Second",
      });

      const { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries.map((e) => [e.oldValue, e.newValue])).toEqual([
        ["First", "Second"],
        [null, "First"],
      ]);
    });

    test<CustomTestContext>("history is deleted with the bookmark", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);
      // The first edit gets committed by the second; the second stays pending.
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Title",
      });
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Another title",
      });
      expect(await db.select().from(bookmarkEditHistory)).toHaveLength(1);

      await api.bookmarks.deleteBookmark({ bookmarkId: bookmark.id });
      expect(await db.select().from(bookmarkEditHistory)).toHaveLength(0);

      // The pending edit lives in the attached file, outside the FK cascade.
      const pendingRows = db.all(
        sql`SELECT id FROM ${sql.raw(PENDING_EDITS_TABLE)} WHERE bookmarkId = ${bookmark.id}`,
      );
      expect(pendingRows).toHaveLength(0);
    });
  });

  describe("rollback", () => {
    test<CustomTestContext>("the latest edit is pending until the next edit", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "One",
      });
      let { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries.map((e) => [e.newValue, e.pending])).toEqual([
        ["One", true],
      ]);
      expect(await db.select().from(bookmarkEditHistory)).toHaveLength(0);

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Two",
      });
      ({ entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      }));
      expect(entries.map((e) => [e.newValue, e.pending])).toEqual([
        ["Two", true],
        ["One", false],
      ]);
      expect(await db.select().from(bookmarkEditHistory)).toHaveLength(1);
    });

    test<CustomTestContext>("rolling back restores the old values and drops the entry", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await api.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com",
      });
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Kept",
      });
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Mistake",
        description: "Oops",
        archived: true,
      });

      const restored = await api.bookmarks.rollbackBookmarkEdit({
        bookmarkId: bookmark.id,
      });
      expect(restored.title).toEqual("Kept");
      expect(restored.archived).toBe(false);
      assertLinkDescription(restored, null);

      const { entries } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      // Only the committed first edit is left, and it can't be rolled back.
      expect(entries.map((e) => [e.field, e.newValue, e.pending])).toEqual([
        ["title", "Kept", false],
      ]);
      await expect(
        api.bookmarks.rollbackBookmarkEdit({ bookmarkId: bookmark.id }),
      ).rejects.toThrow(/no change to roll back/);
    });

    test<CustomTestContext>("rolling back a first title restores the untitled state", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await api.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com",
      });
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Custom",
      });
      const restored = await api.bookmarks.rollbackBookmarkEdit({
        bookmarkId: bookmark.id,
      });
      // Back to no custom title, not the url the UI was showing as one.
      expect(restored.title).toBeNull();
    });

    test<CustomTestContext>("refuses to roll back when the field changed since", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Mine",
      });
      // Simulates a write that bypasses updateBookmark (e.g. a worker).
      await db
        .update(bookmarks)
        .set({ title: "Changed elsewhere" })
        .where(eq(bookmarks.id, bookmark.id));

      await expect(
        api.bookmarks.rollbackBookmarkEdit({ bookmarkId: bookmark.id }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const current = await api.bookmarks.getBookmark({
        bookmarkId: bookmark.id,
      });
      expect(current.title).toEqual("Changed elsewhere");
    });

    test<CustomTestContext>("only the owner can roll back", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const editorApi = apiCallers[1];
      const bookmark = await createTextBookmark(ownerApi);
      await shareWithCollaborator(ownerApi, editorApi, bookmark.id, "editor");
      await ownerApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Owner's title",
      });

      await expect(
        editorApi.bookmarks.rollbackBookmarkEdit({ bookmarkId: bookmark.id }),
      ).rejects.toThrow(/not allowed/);
      await expect(
        apiCallers[2].bookmarks.rollbackBookmarkEdit({
          bookmarkId: bookmark.id,
        }),
      ).rejects.toThrow(/Bookmark not found/);

      const current = await ownerApi.bookmarks.getBookmark({
        bookmarkId: bookmark.id,
      });
      expect(current.title).toEqual("Owner's title");
    });
  });

  describe("authorization", () => {
    test<CustomTestContext>("users without access to the bookmark get NOT_FOUND", async ({
      apiCallers,
    }) => {
      const bookmark = await createTextBookmark(apiCallers[0]);
      await apiCallers[0].bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Private title",
      });

      await expect(
        apiCallers[1].bookmarks.getBookmarkHistory({ bookmarkId: bookmark.id }),
      ).rejects.toThrow(/Bookmark not found/);
    });

    test<CustomTestContext>("unauthenticated callers are rejected", async ({
      apiCallers,
      unauthedAPICaller,
    }) => {
      const bookmark = await createTextBookmark(apiCallers[0]);
      await expect(
        unauthedAPICaller.bookmarks.getBookmarkHistory({
          bookmarkId: bookmark.id,
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    test<CustomTestContext>("collaborators don't see changes to owner-only fields", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const collaboratorApi = apiCallers[1];
      const bookmark = await createTextBookmark(ownerApi);
      await shareWithCollaborator(
        ownerApi,
        collaboratorApi,
        bookmark.id,
        "viewer",
      );

      await ownerApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Shared title",
        note: "My private note",
        archived: true,
        favourited: true,
      });

      const ownerView = await ownerApi.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(ownerView.entries.map((e) => e.field).sort()).toEqual([
        "archived",
        "favourited",
        "note",
        "title",
      ]);

      const collaboratorView =
        await collaboratorApi.bookmarks.getBookmarkHistory({
          bookmarkId: bookmark.id,
        });
      expect(collaboratorView.entries.map((e) => e.field)).toEqual(["title"]);
      expect(JSON.stringify(collaboratorView)).not.toContain("My private note");
    });

    test<CustomTestContext>("collaborators can't create history by editing", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const editorApi = apiCallers[1];
      const bookmark = await createTextBookmark(ownerApi);
      await shareWithCollaborator(ownerApi, editorApi, bookmark.id, "editor");

      await expect(
        editorApi.bookmarks.updateBookmark({
          bookmarkId: bookmark.id,
          title: "Hijacked",
        }),
      ).rejects.toThrow(/not allowed/);

      const { entries } = await ownerApi.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(entries).toEqual([]);
    });
  });
});
