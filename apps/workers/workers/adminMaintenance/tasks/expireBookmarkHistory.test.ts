import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { bookmarkHistory, users } from "@karakeep/db/schema";
import { BOOKMARK_HISTORY_RETENTION_DAYS } from "@karakeep/shared/types/bookmarkHistory";

const mocks = await vi.hoisted(async () => {
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { db: getInMemoryDB(true), enqueue: vi.fn() };
});
vi.mock("@karakeep/db", async (original) => ({
  ...(await original<typeof import("@karakeep/db")>()),
  db: mocks.db,
}));
vi.mock("@karakeep/shared-server", () => ({
  AdminMaintenanceQueue: { enqueue: mocks.enqueue },
}));
import { expireHistory } from "./expireBookmarkHistory";

beforeEach(async () => {
  vi.clearAllMocks();
  await mocks.db.delete(bookmarkHistory);
  await mocks.db.delete(users);
});
afterEach(() => vi.restoreAllMocks());
test("removes multiple batches including the exact expiry boundary, keeps recent events, and is idempotent", async () => {
  const now = Date.now(),
    cutoff = now - BOOKMARK_HISTORY_RETENTION_DAYS * 86400000;
  vi.spyOn(Date, "now").mockReturnValue(now);
  const [user] = await mocks.db
    .insert(users)
    .values({ name: "History owner", email: "history@test.com" })
    .returning();
  for (let batch = 0; batch < 3; batch++)
    await mocks.db.insert(bookmarkHistory).values(
      Array.from({ length: 200 }, (_, i) => ({
        id: `expired-${batch}-${i}`,
        ownerId: user.id,
        bookmarkId: "deleted",
        createdAt: new Date(cutoff - (batch * 200 + i)),
        type: "edit" as const,
        changes: [],
      })),
    );
  await mocks.db.insert(bookmarkHistory).values({
    id: "recent",
    ownerId: user.id,
    bookmarkId: "deleted",
    createdAt: new Date(now),
    type: "deleted",
    changes: [],
  });
  await expireHistory();
  expect(
    (await mocks.db.select().from(bookmarkHistory)).map((e) => e.id),
  ).toEqual(["recent"]);
  await expireHistory();
  expect(await mocks.db.select().from(bookmarkHistory)).toHaveLength(1);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
test("yields long cleanups to a continuation on the existing queue", async () => {
  const now = Date.now();
  vi.spyOn(Date, "now")
    .mockReturnValueOnce(now)
    .mockReturnValueOnce(now)
    .mockReturnValue(now + 120001);
  await expireHistory();
  expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith({
    type: "expire_bookmark_history",
  });
});
