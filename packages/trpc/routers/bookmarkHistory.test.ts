import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { bookmarkHistory, bookmarks } from "@karakeep/db/schema";
import { defaultBeforeEach } from "../testUtils";
import type { CustomTestContext } from "../testUtils";
import { historySnapshot, recordHistory } from "../lib/bookmarkHistory";
beforeEach<CustomTestContext>(defaultBeforeEach(true));
test<CustomTestContext>("groups real changes, ignores no-ops, handles clearing text", async ({
  apiCallers,
}) => {
  const api = apiCallers[0].bookmarks;
  const b = await api.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "original",
    title: "Before",
  });
  await api.updateBookmark({
    bookmarkId: b.id,
    title: "After",
    note: "private",
  });
  let history = await api.getHistory({ bookmarkId: b.id });
  expect(history.events).toHaveLength(1);
  expect(history.events[0].changes).toEqual(
    expect.arrayContaining([
      { field: "title", oldValue: "Before", newValue: "After" },
      { field: "note", oldValue: null, newValue: "private" },
    ]),
  );
  await api.updateBookmark({ bookmarkId: b.id, title: "After" });
  expect((await api.getHistory({ bookmarkId: b.id })).events).toHaveLength(1);
  await api.updateBookmark({ bookmarkId: b.id, text: "" });
  expect(
    (await api.getHistory({ bookmarkId: b.id })).events.flatMap(
      (e) => e.changes,
    ),
  ).toContainEqual({ field: "text", oldValue: "original", newValue: "" });
});
test<CustomTestContext>("keeps deletion audit private and hides expired events", async ({
  apiCallers,
  db,
}) => {
  const api = apiCallers[0].bookmarks;
  const b = await api.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "test",
    title: "Deleted title",
  });
  await api.updateBookmark({ bookmarkId: b.id, note: "secret" });
  await api.deleteBookmark({ bookmarkId: b.id });
  expect((await api.getHistory({ bookmarkId: b.id })).deleted).toBe(true);
  expect((await api.getDeletedHistory({})).events[0].bookmarkId).toBe(b.id);
  await expect(
    apiCallers[1].bookmarks.getHistory({ bookmarkId: b.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await db
    .update(bookmarkHistory)
    .set({ createdAt: new Date(Date.now() - 91 * 86400000) })
    .where(eq(bookmarkHistory.bookmarkId, b.id));
  expect((await api.getDeletedHistory({})).events).toHaveLength(0);
  await expect(api.getHistory({ bookmarkId: b.id })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
});
test<CustomTestContext>("rolls history and data back together", async ({
  apiCallers,
  db,
}) => {
  const b = await apiCallers[0].bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "test",
    title: "Before",
  });
  expect(() =>
    db.transaction((tx) => {
      const before = historySnapshot(tx, b.id);
      tx.update(bookmarks)
        .set({ title: "After" })
        .where(eq(bookmarks.id, b.id))
        .run();
      recordHistory(tx, before, b.userId);
      throw new Error("rollback");
    }),
  ).toThrow("rollback");
  expect(
    (await apiCallers[0].bookmarks.getHistory({ bookmarkId: b.id })).events,
  ).toHaveLength(0);
  expect(
    (await apiCallers[0].bookmarks.getBookmark({ bookmarkId: b.id })).title,
  ).toBe("Before");
});
test<CustomTestContext>("records tag rename and list membership lifecycle", async ({
  apiCallers,
}) => {
  const api = apiCallers[0];
  const b = await api.bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "test",
  });
  const tag = await api.tags.create({ name: "Before" });
  await api.bookmarks.updateTags({
    bookmarkId: b.id,
    attach: [{ tagId: tag.id, attachedBy: "human" }],
    detach: [],
  });
  await api.tags.update({ tagId: tag.id, name: "After" });
  const list = await api.lists.create({
    name: "Queue",
    icon: "📚",
    type: "manual",
  });
  await api.lists.addToList({ bookmarkId: b.id, listId: list.id });
  await api.lists.delete({ listId: list.id });
  const fields = (
    await api.bookmarks.getHistory({ bookmarkId: b.id })
  ).events.flatMap((e) => e.changes.map((c) => c.field));
  expect(fields.filter((f) => f === "tags")).toHaveLength(2);
  expect(fields.filter((f) => f === "lists")).toHaveLength(2);
});

test<CustomTestContext>("paginates tied timestamps without duplicates", async ({
  apiCallers,
  db,
}) => {
  const api = apiCallers[0].bookmarks;
  const b = await api.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "test",
  });
  for (const title of ["One", "Two", "Three"])
    await api.updateBookmark({ bookmarkId: b.id, title });
  await db
    .update(bookmarkHistory)
    .set({ createdAt: new Date() })
    .where(eq(bookmarkHistory.bookmarkId, b.id));
  const first = await api.getHistory({ bookmarkId: b.id, limit: 2 });
  const second = await api.getHistory({
    bookmarkId: b.id,
    limit: 2,
    cursor: first.nextCursor,
  });
  expect(first.events).toHaveLength(2);
  expect(second.events).toHaveLength(1);
  expect(
    new Set([...first.events, ...second.events].map((e) => e.id)).size,
  ).toBe(3);
  expect(second.nextCursor).toBeNull();
});

test<CustomTestContext>("denies history to a collaborator who can read the bookmark", async ({
  apiCallers,
}) => {
  const [owner, viewer] = apiCallers;
  const b = await owner.bookmarks.createBookmark({
    type: BookmarkTypes.TEXT,
    text: "test",
  });
  const list = await owner.lists.create({
    type: "manual",
    name: "Shared",
    icon: "📚",
  });
  await owner.lists.addToList({ listId: list.id, bookmarkId: b.id });
  const user = await viewer.users.whoami();
  const { invitationId } = await owner.lists.addCollaborator({
    listId: list.id,
    email: user.email!,
    role: "viewer",
  });
  await viewer.lists.acceptInvitation({ invitationId });
  await expect(
    viewer.bookmarks.getBookmark({ bookmarkId: b.id }),
  ).resolves.toMatchObject({ id: b.id });
  await expect(
    viewer.bookmarks.getHistory({ bookmarkId: b.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
