import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { PENDING_EDITS_TABLE } from "@karakeep/db/pendingHistory";
import {
  assets,
  AssetTypes,
  bookmarkEditHistory,
  bookmarks,
} from "@karakeep/db/schema";
import type {
  ZBookmarkHistoryEvent,
  ZBookmarkHistoryValue,
} from "@karakeep/shared/types/bookmarkHistory";
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

function assertText(bookmark: ZBookmark, expected: string | null) {
  if (bookmark.content.type !== BookmarkTypes.TEXT) {
    throw new Error("Expected a text bookmark");
  }
  expect(bookmark.content.text ?? null).toEqual(expected);
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
  return list;
}

const isCreation = (event: ZBookmarkHistoryEvent) =>
  event.changes.some((c) => c.field === "created");

// The bookmark's history apart from its creation, newest event first.
async function editsOf(api: APICallerType, bookmarkId: string) {
  const { events } = await api.bookmarks.getBookmarkHistory({ bookmarkId });
  return events.filter((e) => !isCreation(e));
}

// Tags, lists and attachments as their names, for readable assertions.
function simplify(value: ZBookmarkHistoryValue) {
  return Array.isArray(value) ? value.map((i) => i.name) : value;
}

// Each event as its [field, oldValue, newValue] changes.
function changesOf(events: ZBookmarkHistoryEvent[]) {
  return events.map((e) =>
    e.changes.map((c) => [c.field, simplify(c.oldValue), simplify(c.newValue)]),
  );
}

describe("Bookmark edit history", () => {
  describe("capturing changes", () => {
    test<CustomTestContext>("records the bookmark's creation", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const before = Date.now();
      const bookmark = await createTextBookmark(api);

      const { events } = await api.bookmarks.getBookmarkHistory({
        bookmarkId: bookmark.id,
      });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        pending: false,
        editor: { name: "Test User 1" },
        changes: [{ field: "created", oldValue: null, newValue: null }],
      });
      expect(events[0].createdAt.getTime()).toBeGreaterThanOrEqual(before);
    });

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

      const edits = await editsOf(api, bookmark.id);
      expect(edits).toHaveLength(1);
      expect(edits[0]).toMatchObject({
        editor: { name: "Test User 1" },
        changes: [{ field: "title", oldValue: null, newValue: "First title" }],
      });
      expect(edits[0].editor.id).toEqual((await api.users.whoami()).id);
      expect(edits[0].createdAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    test<CustomTestContext>("groups one save's fields into an event, newest event first", async ({
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

      // The second save is still pending and the first is committed; both
      // list their fields in the order they were recorded.
      expect(changesOf(await editsOf(api, bookmark.id))).toEqual([
        [
          ["url", "https://example.com", "https://example.org"],
          ["favourited", false, true],
        ],
        [["description", null, "A description"]],
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

      expect(await editsOf(api, bookmark.id)).toEqual([]);
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

      expect(await editsOf(api, bookmark.id)).toEqual([]);
    });

    test<CustomTestContext>("records text bookmark content and the saved date", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        text: "Edited text",
      });
      // The deprecated endpoint is recorded too.
      await api.bookmarks.updateBookmarkText({
        bookmarkId: bookmark.id,
        text: "Edited again",
      });
      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        createdAt: new Date("2025-01-02T03:04:05.678Z"),
      });

      const edits = await editsOf(api, bookmark.id);
      expect(changesOf(edits.slice(1))).toEqual([
        [["text", "Edited text", "Edited again"]],
        [["text", "Some text", "Edited text"]],
      ]);
      expect(edits[0].changes).toMatchObject([
        { field: "createdAt", newValue: "2025-01-02T03:04:05.000Z" },
      ]);
    });

    test<CustomTestContext>("records tags added and removed", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      await api.bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "beta" }, { tagName: "alpha" }],
        detach: [],
      });
      await api.bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "gamma" }],
        detach: [{ tagName: "alpha" }],
      });
      // Attaching a tag that's already there changes nothing.
      await api.bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "beta" }],
        detach: [],
      });

      expect(changesOf(await editsOf(api, bookmark.id))).toEqual([
        [["tags", ["alpha"], ["gamma"]]],
        [["tags", [], ["alpha", "beta"]]],
      ]);
    });

    test<CustomTestContext>("records list membership, which can't be undone", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);
      const list = await api.lists.create({
        name: "Reading",
        icon: "📖",
        type: "manual",
      });

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Title",
      });
      await api.lists.addToList({ listId: list.id, bookmarkId: bookmark.id });

      let edits = await editsOf(api, bookmark.id);
      expect(changesOf(edits)).toEqual([
        [["lists", [], ["Reading"]]],
        [["title", null, "Title"]],
      ]);
      // A new change makes the title edit final, and the list change itself
      // isn't pending.
      expect(edits.map((e) => e.pending)).toEqual([false, false]);
      await expect(
        api.bookmarks.rollbackBookmarkEdit({ bookmarkId: bookmark.id }),
      ).rejects.toThrow(/no change to roll back/);

      await api.lists.removeFromList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });
      edits = await editsOf(api, bookmark.id);
      expect(changesOf(edits.slice(0, 1))).toEqual([
        [["lists", ["Reading"], []]],
      ]);
    });

    test<CustomTestContext>("records bookmarks leaving a deleted or merged list", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const first = await createTextBookmark(api);
      const second = await createTextBookmark(api);
      const source = await api.lists.create({
        name: "Source",
        icon: "📥",
        type: "manual",
      });
      const target = await api.lists.create({
        name: "Target",
        icon: "📤",
        type: "manual",
      });
      await api.lists.addToList({ listId: source.id, bookmarkId: first.id });
      await api.lists.addToList({ listId: source.id, bookmarkId: second.id });
      await api.lists.addToList({ listId: target.id, bookmarkId: second.id });

      await api.lists.merge({
        sourceId: source.id,
        targetId: target.id,
        deleteSourceAfterMerge: true,
      });

      expect(changesOf((await editsOf(api, first.id)).slice(0, 1))).toEqual([
        [["lists", ["Source"], ["Target"]]],
      ]);
      // Already in the target, so it only left the source.
      expect(changesOf((await editsOf(api, second.id)).slice(0, 1))).toEqual([
        [["lists", ["Source"], []]],
      ]);

      await api.lists.delete({ listId: target.id });
      expect(changesOf((await editsOf(api, first.id)).slice(0, 1))).toEqual([
        [["lists", ["Target"], []]],
      ]);
    });

    test<CustomTestContext>("records attachments added, replaced and removed", async ({
      apiCallers,
      db,
    }) => {
      const api = apiCallers[0];
      const userId = (await api.users.whoami()).id;
      const bookmark = await api.bookmarks.createBookmark({
        type: BookmarkTypes.LINK,
        url: "https://example.com",
      });
      await db.insert(assets).values([
        {
          id: "upload1",
          assetType: AssetTypes.UNKNOWN,
          bookmarkId: null,
          userId,
          fileName: "cover.png",
        },
        {
          id: "upload2",
          assetType: AssetTypes.UNKNOWN,
          bookmarkId: null,
          userId,
          fileName: "better-cover.png",
        },
      ]);

      await api.assets.attachAsset({
        bookmarkId: bookmark.id,
        asset: { id: "upload1", assetType: "bannerImage" },
      });
      await api.assets.replaceAsset({
        bookmarkId: bookmark.id,
        oldAssetId: "upload1",
        newAssetId: "upload2",
      });
      await api.assets.detachAsset({
        bookmarkId: bookmark.id,
        assetId: "upload2",
      });

      const edits = await editsOf(api, bookmark.id);
      expect(changesOf(edits)).toEqual([
        [["attachments", ["better-cover.png"], []]],
        [["attachments", ["cover.png"], ["better-cover.png"]]],
        [["attachments", [], ["cover.png"]]],
      ]);
      expect(edits[2].changes[0].newValue).toEqual([
        { id: "upload1", name: "cover.png", assetType: "bannerImage" },
      ]);
      expect(edits.every((e) => !e.pending)).toBe(true);
    });

    test<CustomTestContext>("records tags merged or deleted on every affected bookmark", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const first = await createTextBookmark(api);
      const second = await createTextBookmark(api);
      await api.bookmarks.updateTags({
        bookmarkId: first.id,
        attach: [{ tagName: "old-one" }, { tagName: "doomed" }],
        detach: [],
      });
      await api.bookmarks.updateTags({
        bookmarkId: second.id,
        attach: [{ tagName: "old-two" }, { tagName: "target" }],
        detach: [],
      });
      const { tags } = await api.tags.list();
      const tagId = (name: string) => tags.find((t) => t.name === name)!.id;

      await api.tags.merge({
        intoTagId: tagId("target"),
        fromTagIds: [tagId("old-one"), tagId("old-two")],
      });
      expect(changesOf((await editsOf(api, first.id)).slice(0, 1))).toEqual([
        [["tags", ["old-one"], ["target"]]],
      ]);
      // Already had the target tag.
      expect(changesOf((await editsOf(api, second.id)).slice(0, 1))).toEqual([
        [["tags", ["old-two"], []]],
      ]);

      await api.tags.delete({ tagId: tagId("doomed") });
      const edits = await editsOf(api, first.id);
      expect(changesOf(edits.slice(0, 1))).toEqual([
        [["tags", ["doomed"], []]],
      ]);
      // Bulk changes are final.
      expect(edits.every((e) => !e.pending)).toBe(true);
    });

    test<CustomTestContext>("merges note autosaves into one entry", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      for (const note of ["H", "He", "Hello"]) {
        await api.bookmarks.updateBookmark({ bookmarkId: bookmark.id, note });
      }
      expect(changesOf(await editsOf(api, bookmark.id))).toEqual([
        [["note", null, "Hello"]],
      ]);

      // Typing it back to the original value leaves no entry at all.
      await api.bookmarks.updateBookmark({ bookmarkId: bookmark.id, note: "" });
      expect(await editsOf(api, bookmark.id)).toEqual([]);
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

      expect(changesOf(await editsOf(api, bookmark.id))).toEqual([
        [["note", "First", "Second"]],
        [["note", null, "First"]],
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
      // The creation and the first edit.
      expect(await db.select().from(bookmarkEditHistory)).toHaveLength(2);

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
      const committedRows = async () =>
        (await db.select().from(bookmarkEditHistory)).filter(
          (r) => r.field !== "created",
        );

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "One",
      });
      let edits = await editsOf(api, bookmark.id);
      expect(edits.map((e) => [e.changes[0].newValue, e.pending])).toEqual([
        ["One", true],
      ]);
      expect(await committedRows()).toHaveLength(0);

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Two",
      });
      edits = await editsOf(api, bookmark.id);
      expect(edits.map((e) => [e.changes[0].newValue, e.pending])).toEqual([
        ["Two", true],
        ["One", false],
      ]);
      expect(await committedRows()).toHaveLength(1);
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

      // Only the committed first edit is left, and it can't be rolled back.
      const edits = await editsOf(api, bookmark.id);
      // The old title is the url the UI was showing.
      expect(changesOf(edits)).toEqual([
        [["title", "https://example.com", "Kept"]],
      ]);
      expect(edits[0].pending).toBe(false);
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

    test<CustomTestContext>("rolling back restores text content and the saved date", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);

      await api.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        text: "Overwritten by mistake",
        createdAt: new Date("2020-01-01T00:00:00.000Z"),
      });
      const restored = await api.bookmarks.rollbackBookmarkEdit({
        bookmarkId: bookmark.id,
      });
      assertText(restored, "Some text");
      expect(Math.floor(restored.createdAt.getTime() / 1000)).toEqual(
        Math.floor(bookmark.createdAt.getTime() / 1000),
      );
    });

    test<CustomTestContext>("rolling back a tag change detaches and reattaches tags", async ({
      apiCallers,
    }) => {
      const api = apiCallers[0];
      const bookmark = await createTextBookmark(api);
      const tagNames = async () =>
        (await api.bookmarks.getBookmark({ bookmarkId: bookmark.id })).tags
          .map((t) => [t.name, t.attachedBy])
          .sort();

      await api.bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "kept" }, { tagName: "by-ai", attachedBy: "ai" }],
        detach: [],
      });
      await api.bookmarks.updateTags({
        bookmarkId: bookmark.id,
        attach: [{ tagName: "added-by-mistake" }],
        detach: [{ tagName: "by-ai" }],
      });

      await api.bookmarks.rollbackBookmarkEdit({ bookmarkId: bookmark.id });
      // The tag removed by mistake is back, attached the way it was.
      expect(await tagNames()).toEqual([
        ["by-ai", "ai"],
        ["kept", "human"],
      ]);
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

    test<CustomTestContext>("a collaborator's change doesn't make the owner's edit final", async ({
      apiCallers,
    }) => {
      const ownerApi = apiCallers[0];
      const editorApi = apiCallers[1];
      const bookmark = await createTextBookmark(ownerApi);
      const list = await shareWithCollaborator(
        ownerApi,
        editorApi,
        bookmark.id,
        "editor",
      );
      await ownerApi.bookmarks.updateBookmark({
        bookmarkId: bookmark.id,
        title: "Owner's title",
      });

      await editorApi.lists.removeFromList({
        listId: list.id,
        bookmarkId: bookmark.id,
      });

      const edits = await editsOf(ownerApi, bookmark.id);
      expect(
        edits.map((e) => [e.changes[0].field, e.editor.name, e.pending]),
      ).toEqual([
        ["lists", "Test User 2", false],
        ["title", "Test User 1", true],
        ["lists", "Test User 1", false],
      ]);
      const restored = await ownerApi.bookmarks.rollbackBookmarkEdit({
        bookmarkId: bookmark.id,
      });
      expect(restored.title).toBeNull();
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
        title: "Visible title",
        note: "My private note",
        archived: true,
        favourited: true,
      });

      const ownerFields = (await editsOf(ownerApi, bookmark.id))
        .flatMap((e) => e.changes.map((c) => c.field))
        .sort();
      expect(ownerFields).toEqual([
        "archived",
        "favourited",
        "lists",
        "note",
        "title",
      ]);

      // No notes, flags or list names; events left without visible changes
      // are dropped.
      const collaboratorView = await editsOf(collaboratorApi, bookmark.id);
      expect(changesOf(collaboratorView)).toEqual([
        [["title", null, "Visible title"]],
      ]);
      expect(JSON.stringify(collaboratorView)).not.toContain("My private note");
      expect(JSON.stringify(collaboratorView)).not.toContain("Shared");
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

      // Only the owner adding it to the shared list.
      expect(changesOf(await editsOf(ownerApi, bookmark.id))).toEqual([
        [["lists", [], ["Shared"]]],
      ]);
    });
  });
});
