import { eq, sql } from "drizzle-orm";
import { expect, test, vi } from "vitest";

vi.mock("@karakeep/db", async (original) => {
  const actual = await original<typeof import("@karakeep/db")>();
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return { ...actual, db: getInMemoryDB(true) };
});
import { db } from "@karakeep/db";
import {
  assets,
  AssetTypes,
  bookmarkLinks,
  bookmarks,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { getBookmarkDetails } from "./workerUtils";

test("crawler uses the same deterministic archive order as bookmark previews", async () => {
  const [user] = await db
    .insert(users)
    .values({ name: "Archive test", email: "archive@example.com" })
    .returning();
  const [bookmark] = await db
    .insert(bookmarks)
    .values({ userId: user.id, type: BookmarkTypes.LINK })
    .returning();
  await db
    .insert(bookmarkLinks)
    .values({ id: bookmark.id, url: "https://example.com/archive" });
  for (const [id, createdAt] of [
    ["new-z", new Date(2000)],
    ["new-a", new Date(2000)],
    ["old-z", new Date(1000)],
    ["legacy-z", null],
  ] as const) {
    await db.insert(assets).values({
      id,
      userId: user.id,
      bookmarkId: bookmark.id,
      createdAt,
      assetType: AssetTypes.LINK_PRECRAWLED_ARCHIVE,
    });
  }
  for (const reverse of [false, true]) {
    db.run(
      reverse
        ? sql`PRAGMA reverse_unordered_selects = ON`
        : sql`PRAGMA reverse_unordered_selects = OFF`,
    );
    expect(
      (await getBookmarkDetails(bookmark.id)).precrawledArchiveAssetId,
    ).toBe("new-z");
  }
  await db
    .update(assets)
    .set({ createdAt: null })
    .where(eq(assets.bookmarkId, bookmark.id));
  expect((await getBookmarkDetails(bookmark.id)).precrawledArchiveAssetId).toBe(
    "old-z",
  );
});
