import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ZAdminMaintenanceTask } from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { bookmarks, users } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { Bookmark } from "@karakeep/trpc/models/bookmarks";

import { runPurgeExpiredTrashTask } from "./purgeExpiredTrash";

const mocks = await vi.hoisted(async () => {
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return {
    db: getInMemoryDB(true),
    adminMaintenanceEnqueue: vi.fn(),
    searchIndexingEnqueue: vi.fn(),
    embeddingsEnqueue: vi.fn(),
  };
});

vi.mock("@karakeep/db", async (original) => ({
  ...(await original<typeof import("@karakeep/db")>()),
  db: mocks.db,
}));

vi.mock("@karakeep/shared-server", async (original) => ({
  ...(await original<typeof import("@karakeep/shared-server")>()),
  AdminMaintenanceQueue: { enqueue: mocks.adminMaintenanceEnqueue },
  SearchIndexingQueue: { enqueue: mocks.searchIndexingEnqueue },
  EmbeddingsQueue: { enqueue: mocks.embeddingsEnqueue },
}));

const db = mocks.db;

const task = { type: "purge_expired_trash" as const };

function buildJob(
  abortSignal = new AbortController().signal,
): DequeuedJob<ZAdminMaintenanceTask> {
  return { id: "job", data: task, priority: 0, runNumber: 0, abortSignal };
}

const DAY = 24 * 60 * 60 * 1000;

async function createUserWithBookmarks(deleteAts: (Date | null)[]) {
  const [user] = await db
    .insert(users)
    .values({
      name: "Test",
      email: `${crypto.randomUUID()}@test.com`,
    })
    .returning();
  const created = await db
    .insert(bookmarks)
    .values(
      deleteAts.map((deleteAt, i): typeof bookmarks.$inferInsert => ({
        userId: user.id,
        type: BookmarkTypes.TEXT,
        title: `bookmark-${i}`,
        deleteAt,
      })),
    )
    .returning();
  return { user, bookmarkIds: created.map((b) => b.id) };
}

async function remainingBookmarkIds(userId: string) {
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId));
  return rows.map((r) => r.id).sort();
}

const fastOpts = {
  batchSize: 2,
  interBatchPauseMs: 0,
  runTimeBudgetMs: 60_000,
};

describe("purge_expired_trash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("only deletes bookmarks whose trash retention has expired", async () => {
    const now = Date.now();
    const { user, bookmarkIds } = await createUserWithBookmarks([
      null,
      new Date(now + DAY),
      new Date(now - DAY),
      new Date(now - 2 * DAY),
      new Date(now - 3 * DAY),
    ]);
    const other = await createUserWithBookmarks([new Date(now - DAY), null]);

    await runPurgeExpiredTrashTask(buildJob(), fastOpts);

    expect(await remainingBookmarkIds(user.id)).toEqual(
      bookmarkIds.slice(0, 2).sort(),
    );
    expect(await remainingBookmarkIds(other.user.id)).toEqual([
      other.bookmarkIds[1],
    ]);
    expect(mocks.searchIndexingEnqueue).toHaveBeenCalledTimes(4);
    expect(mocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
  });

  test("yields by enqueueing a continuation once the time budget is spent", async () => {
    const expired = new Date(Date.now() - DAY);
    const { user } = await createUserWithBookmarks([
      expired,
      expired,
      expired,
      expired,
    ]);

    await runPurgeExpiredTrashTask(buildJob(), {
      ...fastOpts,
      runTimeBudgetMs: 0,
    });

    expect(await remainingBookmarkIds(user.id)).toHaveLength(2);
    expect(mocks.adminMaintenanceEnqueue).toHaveBeenCalledWith(task);
  });

  test("doesn't delete a bookmark that gets restored mid-purge", async () => {
    const { user, bookmarkIds } = await createUserWithBookmarks([
      new Date(Date.now() - DAY),
    ]);
    const fromId = Bookmark.fromId.bind(Bookmark);
    const spy = vi
      .spyOn(Bookmark, "fromId")
      .mockImplementation(async (...args) => {
        const bookmark = await fromId(...args);
        // The user restores it right after the purge loaded it
        await db
          .update(bookmarks)
          .set({ deleteAt: null })
          .where(eq(bookmarks.id, args[1]));
        return bookmark;
      });

    try {
      await runPurgeExpiredTrashTask(buildJob(), fastOpts);
    } finally {
      spy.mockRestore();
    }

    expect(await remainingBookmarkIds(user.id)).toEqual(bookmarkIds);
    expect(mocks.searchIndexingEnqueue).not.toHaveBeenCalled();
    expect(mocks.embeddingsEnqueue).not.toHaveBeenCalled();
  });

  test("stops when the job is aborted", async () => {
    const { user } = await createUserWithBookmarks([
      new Date(Date.now() - DAY),
    ]);
    const controller = new AbortController();
    controller.abort();

    await runPurgeExpiredTrashTask(buildJob(controller.signal), fastOpts);

    expect(await remainingBookmarkIds(user.id)).toHaveLength(1);
  });
});
