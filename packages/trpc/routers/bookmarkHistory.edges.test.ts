import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assets,
  AssetTypes,
  bookmarkHistory,
  bookmarks,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { BOOKMARK_HISTORY_RETENTION_DAYS } from "@karakeep/shared/types/bookmarkHistory";
import { defaultBeforeEach, getApiKeyCallerForPlainKey } from "../testUtils";
import type { CustomTestContext } from "../testUtils";
import { historyTransaction } from "../lib/bookmarkHistory";
import { Bookmark } from "../models/bookmarks";

beforeEach<CustomTestContext>(defaultBeforeEach(true));
afterEach(() => vi.restoreAllMocks());

const textItem = (ctx: CustomTestContext) =>
  ctx.apiCallers[0].bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "Body",
    title: "Original",
  });

test<CustomTestContext>("captures all editable link metadata and rejects invalid subtype edits atomically", async (ctx) => {
  const api = ctx.apiCallers[0].bookmarks;
  const b = await api.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://example.com/original",
  });
  const date = new Date("2026-01-01T00:00:00Z");
  await api.updateBookmark({
    bookmarkId: b.id,
    title: "Changed",
    url: "https://example.com/changed",
    description: "Description",
    author: "Author",
    publisher: "Publisher",
    datePublished: date,
    dateModified: date,
    note: "Personal",
    summary: "Summary",
    archived: true,
    favourited: true,
    createdAt: date,
  });
  const history = await api.getHistory({ bookmarkId: b.id });
  expect(history.events).toHaveLength(1);
  expect(history.events[0].changes.map((c) => c.field).sort()).toEqual(
    [
      "title",
      "link.url",
      "link.description",
      "link.author",
      "link.publisher",
      "link.datePublished",
      "link.dateModified",
      "note",
      "summary",
      "archived",
      "favourited",
      "createdAt",
    ].sort(),
  );
  const url = history.events[0].changes.find((c) => c.field === "link.url");
  expect(url).toEqual({
    field: "link.url",
    oldValue: "https://example.com/original",
    newValue: "https://example.com/changed",
  });
  await api.updateBookmark({
    bookmarkId: b.id,
    url: "https://example.com/changed",
    datePublished: new Date(date),
  });
  expect((await api.getHistory({ bookmarkId: b.id })).events).toHaveLength(1);
  await expect(
    api.updateBookmark({
      bookmarkId: b.id,
      title: "Must roll back",
      text: "Wrong subtype",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await api.getBookmark({ bookmarkId: b.id })).title).toBe("Changed");
  expect((await api.getHistory({ bookmarkId: b.id })).events).toHaveLength(1);
});

test<CustomTestContext>("captures legacy text edits and omits empty-value and bookkeeping no-ops", async (ctx) => {
  const b = await textItem(ctx),
    api = ctx.apiCallers[0].bookmarks;
  await api.updateBookmark({ bookmarkId: b.id, note: "" });
  await api.updateBookmark({ bookmarkId: b.id });
  expect((await api.getHistory({ bookmarkId: b.id })).events).toHaveLength(0);
  await api.updateBookmarkText({ bookmarkId: b.id, text: "Legacy edit" });
  await api.updateBookmarkText({ bookmarkId: b.id, text: "Legacy edit" });
  expect((await api.getHistory({ bookmarkId: b.id })).events).toHaveLength(1);
});

test<CustomTestContext>("tracks re-saves but keeps RSS/import deduplication silent", async (ctx) => {
  const api = ctx.apiCallers[0].bookmarks,
    b = await api.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com",
      archived: true,
      createdAt: new Date("2020-01-01"),
    });
  for (const source of ["rss", "import"] as const)
    await api.createBookmark({
      type: BookmarkTypes.LINK,
      url: "https://example.com",
      source,
    });
  expect((await api.getHistory({ bookmarkId: b.id })).events).toHaveLength(0);
  await api.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://example.com",
    title: "Saved again",
  });
  const fields = (await api.getHistory({ bookmarkId: b.id })).events[0].changes;
  expect(fields).toContainEqual({
    field: "archived",
    oldValue: true,
    newValue: false,
  });
  expect(fields.some((c) => c.field === "createdAt")).toBe(true);
});

test<CustomTestContext>("scopes API-key access and records actual key attribution", async (ctx) => {
  const b = await textItem(ctx),
    api = ctx.apiCallers[0];
  const key = await api.apiKeys.create({
    name: "History writer",
    scopes: ["bookmarks:readwrite"],
  });
  const writer = await getApiKeyCallerForPlainKey(ctx.db, key.key);
  await writer.bookmarks.updateBookmark({ bookmarkId: b.id, title: "Via key" });
  expect(
    (await writer.bookmarks.getHistory({ bookmarkId: b.id })).events[0],
  ).toMatchObject({ actorKind: "apiKey", actorId: b.userId });
  const read = await api.apiKeys.create({
    name: "History reader",
    scopes: ["bookmarks:read"],
  });
  await expect(
    (await getApiKeyCallerForPlainKey(ctx.db, read.key)).bookmarks.getHistory({
      bookmarkId: b.id,
    }),
  ).resolves.toMatchObject({ deleted: false });
  const denied = await api.apiKeys.create({
    name: "No bookmarks",
    scopes: ["tags:read"],
  });
  const caller = await getApiKeyCallerForPlainKey(ctx.db, denied.key);
  await expect(
    caller.bookmarks.getHistory({ bookmarkId: b.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(caller.bookmarks.getDeletedHistory({})).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    ctx.unauthedAPICaller.bookmarks.getHistory({ bookmarkId: b.id }),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
});

test<CustomTestContext>("captures actual tag changes through merge and deletion", async (ctx) => {
  const b = await textItem(ctx),
    api = ctx.apiCallers[0];
  const tag = await api.tags.create({ name: "Source" }),
    target = await api.tags.create({ name: "Target" });
  const request = {
    bookmarkId: b.id,
    attach: [{ tagId: tag.id, attachedBy: "human" as const }],
    detach: [],
  };
  await api.bookmarks.updateTags(request);
  await api.bookmarks.updateTags(request);
  expect(
    (await api.bookmarks.getHistory({ bookmarkId: b.id })).events,
  ).toHaveLength(1);
  await api.tags.merge({ fromTagIds: [tag.id], intoTagId: target.id });
  await api.tags.delete({ tagId: target.id });
  const history = await api.bookmarks.getHistory({ bookmarkId: b.id });
  expect(history.events).toHaveLength(3);
  expect(
    history.events
      .flatMap((e) => e.changes)
      .some((c) => JSON.stringify(c.oldValue).includes("Source")),
  ).toBe(true);
});

test<CustomTestContext>("captures list rename/merge and silently ignores duplicate additions", async (ctx) => {
  const b = await textItem(ctx),
    api = ctx.apiCallers[0];
  const source = await api.lists.create({
      type: "manual",
      name: "Source",
      icon: "📚",
    }),
    target = await api.lists.create({
      type: "manual",
      name: "Target",
      icon: "📚",
    });
  await api.lists.addToList({ bookmarkId: b.id, listId: source.id });
  await api.lists.addToList({ bookmarkId: b.id, listId: source.id });
  expect(
    (await api.bookmarks.getHistory({ bookmarkId: b.id })).events,
  ).toHaveLength(1);
  await api.lists.edit({ listId: source.id, name: "Renamed", icon: "📚" });
  await api.lists.merge({
    sourceId: source.id,
    targetId: target.id,
    deleteSourceAfterMerge: true,
  });
  const history = await api.bookmarks.getHistory({ bookmarkId: b.id });
  expect(history.events).toHaveLength(3);
  expect(
    history.events
      .flatMap((e) => e.changes)
      .some((c) => JSON.stringify(c.oldValue).includes("Renamed")),
  ).toBe(true);
});

async function share(ctx: CustomTestContext) {
  const [owner, collaborator] = ctx.apiCallers;
  const b = await collaborator.bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "Other owner's content",
  });
  const list = await owner.lists.create({
    type: "manual",
    name: "Shared",
    icon: "📚",
  });
  const person = await collaborator.users.whoami();
  const { invitationId } = await owner.lists.addCollaborator({
    listId: list.id,
    email: person.email!,
    role: "editor",
  });
  await collaborator.lists.acceptInvitation({ invitationId });
  await collaborator.lists.addToList({ bookmarkId: b.id, listId: list.id });
  return { b, list, person, owner, collaborator };
}
test<CustomTestContext>("records membership cascades when an owner revokes a collaborator", async (ctx) => {
  const { b, list, person, owner, collaborator } = await share(ctx);
  await owner.lists.removeCollaborator({ listId: list.id, userId: person.id });
  const events = (await collaborator.bookmarks.getHistory({ bookmarkId: b.id }))
    .events;
  expect(events).toHaveLength(2);
  expect(
    events.some(
      (e) =>
        e.actorId !== b.userId &&
        e.changes.some(
          (c) => c.field === "lists" && JSON.stringify(c.newValue) === "[]",
        ),
    ),
  ).toBe(true);
  await expect(
    owner.bookmarks.getHistory({ bookmarkId: b.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
test<CustomTestContext>("erases owned audit on account deletion and retains surviving owners' membership changes", async (ctx) => {
  const { b, owner, collaborator } = await share(ctx);
  const owned = await textItem(ctx);
  await owner.bookmarks.updateBookmark({
    bookmarkId: owned.id,
    note: "Erase me",
  });
  await owner.users.deleteAccount({});
  expect(
    await ctx.db
      .select()
      .from(bookmarkHistory)
      .where(eq(bookmarkHistory.ownerId, owned.userId)),
  ).toHaveLength(0);
  expect(
    (await collaborator.bookmarks.getHistory({ bookmarkId: b.id })).events,
  ).toHaveLength(2);
});

test<CustomTestContext>("captures attachment move, replacement and detach, but not no-ops or invalid replacements", async (ctx) => {
  const api = ctx.apiCallers[0],
    a = await textItem(ctx),
    b = await textItem(ctx);
  await ctx.db.insert(assets).values(
    ["old", "new"].map((id) => ({
      id,
      userId: a.userId,
      assetType: AssetTypes.USER_UPLOADED,
      fileName: `${id}.png`,
      contentType: "image/png",
    })),
  );
  await api.assets.attachAsset({
    bookmarkId: a.id,
    asset: { id: "old", assetType: "userUploaded" },
  });
  await api.assets.attachAsset({
    bookmarkId: a.id,
    asset: { id: "old", assetType: "userUploaded" },
  });
  await api.assets.replaceAsset({
    bookmarkId: a.id,
    oldAssetId: "old",
    newAssetId: "old",
  });
  expect(
    (await api.bookmarks.getHistory({ bookmarkId: a.id })).events,
  ).toHaveLength(1);
  await expect(
    api.assets.replaceAsset({
      bookmarkId: b.id,
      oldAssetId: "old",
      newAssetId: "new",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(
    (await api.bookmarks.getHistory({ bookmarkId: b.id })).events,
  ).toHaveLength(0);
  await api.assets.attachAsset({
    bookmarkId: b.id,
    asset: { id: "old", assetType: "userUploaded" },
  });
  expect(
    (await api.bookmarks.getHistory({ bookmarkId: a.id })).events,
  ).toHaveLength(2);
  await api.assets.replaceAsset({
    bookmarkId: b.id,
    oldAssetId: "old",
    newAssetId: "new",
  });
  await api.assets.detachAsset({ bookmarkId: b.id, assetId: "new" });
  const events = (await api.bookmarks.getHistory({ bookmarkId: b.id })).events;
  expect(events).toHaveLength(3);
  expect(
    events.flatMap((e) => e.changes).every((c) => c.field === "attachments"),
  ).toBe(true);
  expect(
    events
      .flatMap((e) => e.changes)
      .some((c) => JSON.stringify(c.oldValue).includes("old.png")),
  ).toBe(true);
});

test<CustomTestContext>("retention excludes the exact cutoff, and item deletion does not extend older events", async (ctx) => {
  const b = await textItem(ctx),
    api = ctx.apiCallers[0].bookmarks,
    now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  await api.updateBookmark({ bookmarkId: b.id, note: "Old note" });
  await ctx.db
    .update(bookmarkHistory)
    .set({
      createdAt: new Date(now - BOOKMARK_HISTORY_RETENTION_DAYS * 86400000),
    })
    .where(eq(bookmarkHistory.bookmarkId, b.id));
  await api.deleteBookmark({ bookmarkId: b.id });
  const history = await api.getHistory({ bookmarkId: b.id });
  expect(history.events).toHaveLength(1);
  expect(history.events[0].type).toBe("deleted");
});

test<CustomTestContext>("internal relationship writes validate IDs without creating misleading user history", async (ctx) => {
  const b = await textItem(ctx),
    context = {
      db: ctx.db,
      user: { id: b.userId, role: "user" as const },
      auth: { type: "internal" as const },
      req: { ip: null },
    };
  const validate = vi.fn(() => [b.id]);
  historyTransaction(context, validate, (tx) =>
    tx
      .update(bookmarks)
      .set({ archived: true })
      .where(eq(bookmarks.id, b.id))
      .run(),
  );
  expect(validate).toHaveBeenCalledOnce();
  expect(
    (await ctx.apiCallers[0].bookmarks.getHistory({ bookmarkId: b.id })).events,
  ).toHaveLength(0);
});

test<CustomTestContext>("a stale bookmark deletion returns NOT_FOUND without a duplicate deletion event", async (ctx) => {
  const b = await textItem(ctx),
    context = {
      db: ctx.db,
      user: { id: b.userId, role: "user" as const },
      auth: { type: "session" as const },
      req: { ip: null },
    };
  const stale = await Bookmark.fromId(context, b.id, false);
  await ctx.apiCallers[0].bookmarks.deleteBookmark({ bookmarkId: b.id });
  await expect(stale.delete()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(
    (await ctx.apiCallers[0].bookmarks.getDeletedHistory({})).events,
  ).toHaveLength(1);
});
