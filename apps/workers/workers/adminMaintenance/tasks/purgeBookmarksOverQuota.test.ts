import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ZAdminMaintenanceTask } from "@karakeep/shared-server";
import type { DequeuedJob } from "@karakeep/shared/queueing";
import { bookmarks, users } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { runPurgeBookmarksOverQuotaTask } from "./purgeBookmarksOverQuota";

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

function buildJob(
  task: ZAdminMaintenanceTask,
  abortSignal = new AbortController().signal,
): DequeuedJob<ZAdminMaintenanceTask> {
  return { id: "job", data: task, priority: 0, runNumber: 0, abortSignal };
}

async function createUserWithBookmarks(
  bookmarkQuota: number | null,
  numBookmarks: number,
) {
  const [user] = await db
    .insert(users)
    .values({
      name: "Test",
      email: `${crypto.randomUUID()}@test.com`,
      bookmarkQuota,
    })
    .returning();
  const base = new Date("2026-01-01T00:00:00.000Z").getTime();
  const created =
    numBookmarks > 0
      ? await db
          .insert(bookmarks)
          .values(
            Array.from(
              { length: numBookmarks },
              (_, i): typeof bookmarks.$inferInsert => ({
                userId: user.id,
                type: BookmarkTypes.TEXT,
                title: `bookmark-${i}`,
                createdAt: new Date(base + i * 1000),
              }),
            ),
          )
          .returning()
      : [];
  return { user, bookmarkIds: created.map((b) => b.id) };
}

async function remainingBookmarkIds(userId: string) {
  const rows = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .orderBy(asc(bookmarks.createdAt));
  return rows.map((r) => r.id);
}

const fastOpts = {
  batchSize: 2,
  interBatchPauseMs: 0,
  runTimeBudgetMs: 60_000,
};

describe("purge_bookmarks_over_quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("deletes the oldest bookmarks until the user is within quota", async () => {
    const { user, bookmarkIds } = await createUserWithBookmarks(3, 8);
    const task = {
      type: "purge_bookmarks_over_quota" as const,
      args: { userId: user.id },
    };

    await runPurgeBookmarksOverQuotaTask(buildJob(task), task, fastOpts);

    expect(await remainingBookmarkIds(user.id)).toEqual(bookmarkIds.slice(5));
    expect(mocks.searchIndexingEnqueue).toHaveBeenCalledTimes(5);
    expect(mocks.embeddingsEnqueue).toHaveBeenCalledTimes(5);
    expect(mocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
  });

  test("doesn't touch other users' bookmarks", async () => {
    const { user } = await createUserWithBookmarks(1, 3);
    const other = await createUserWithBookmarks(1, 3);
    const task = {
      type: "purge_bookmarks_over_quota" as const,
      args: { userId: user.id },
    };

    await runPurgeBookmarksOverQuotaTask(buildJob(task), task, fastOpts);

    expect(await remainingBookmarkIds(user.id)).toHaveLength(1);
    expect(await remainingBookmarkIds(other.user.id)).toEqual(
      other.bookmarkIds,
    );
  });

  test("is a no-op for users without a quota or within quota", async () => {
    const unlimited = await createUserWithBookmarks(null, 3);
    const within = await createUserWithBookmarks(5, 3);

    for (const { user } of [unlimited, within]) {
      const task = {
        type: "purge_bookmarks_over_quota" as const,
        args: { userId: user.id },
      };
      await runPurgeBookmarksOverQuotaTask(buildJob(task), task, fastOpts);
      expect(await remainingBookmarkIds(user.id)).toHaveLength(3);
    }
    expect(mocks.searchIndexingEnqueue).not.toHaveBeenCalled();
  });

  test("is a no-op for a missing user", async () => {
    const task = {
      type: "purge_bookmarks_over_quota" as const,
      args: { userId: "does-not-exist" },
    };
    await runPurgeBookmarksOverQuotaTask(buildJob(task), task, fastOpts);
    expect(mocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
  });

  test("yields by enqueueing a continuation once the time budget is spent", async () => {
    const { user, bookmarkIds } = await createUserWithBookmarks(1, 6);
    const task = {
      type: "purge_bookmarks_over_quota" as const,
      args: { userId: user.id },
    };

    // With a zero budget, every run deletes exactly one batch then yields.
    const opts = { ...fastOpts, runTimeBudgetMs: 0 };

    await runPurgeBookmarksOverQuotaTask(buildJob(task), task, opts);
    expect(await remainingBookmarkIds(user.id)).toEqual(bookmarkIds.slice(2));
    expect(mocks.adminMaintenanceEnqueue).toHaveBeenCalledTimes(1);
    expect(mocks.adminMaintenanceEnqueue).toHaveBeenLastCalledWith(task);

    await runPurgeBookmarksOverQuotaTask(buildJob(task), task, opts);
    expect(await remainingBookmarkIds(user.id)).toEqual(bookmarkIds.slice(4));
    expect(mocks.adminMaintenanceEnqueue).toHaveBeenCalledTimes(2);

    // The last bookmark over quota fits in the final batch, so no more
    // continuations are enqueued.
    await runPurgeBookmarksOverQuotaTask(buildJob(task), task, opts);
    expect(await remainingBookmarkIds(user.id)).toEqual(bookmarkIds.slice(5));
    expect(mocks.adminMaintenanceEnqueue).toHaveBeenCalledTimes(2);
  });

  test("stops when the job is aborted", async () => {
    const { user } = await createUserWithBookmarks(1, 6);
    const task = {
      type: "purge_bookmarks_over_quota" as const,
      args: { userId: user.id },
    };
    const controller = new AbortController();
    controller.abort();

    await runPurgeBookmarksOverQuotaTask(
      buildJob(task, controller.signal),
      task,
      fastOpts,
    );

    expect(await remainingBookmarkIds(user.id)).toHaveLength(6);
    expect(mocks.adminMaintenanceEnqueue).not.toHaveBeenCalled();
  });
});
