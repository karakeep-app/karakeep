import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  bookmarks,
  bookmarkTags,
  tagsOnBookmarks,
  users,
} from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { connectTags } from "./tagging";

const mocks = await vi.hoisted(async () => {
  const { getInMemoryDB } = await import("@karakeep/db/drizzle");
  return {
    db: getInMemoryDB(true),
    triggerOnEvent: vi.fn(),
  };
});

vi.mock("@karakeep/db", async (original) => ({
  ...(await original<typeof import("@karakeep/db")>()),
  db: mocks.db,
}));

vi.mock("@karakeep/trpc/lib/ruleEngine", () => ({
  RuleEngine: { triggerOnEvent: mocks.triggerOnEvent },
}));

const db = mocks.db;

async function createBookmarkWithTags(tags: Record<string, "ai" | "human">) {
  const [user] = await db
    .insert(users)
    .values({ name: "Test", email: `${crypto.randomUUID()}@test.com` })
    .returning();
  const [bookmark] = await db
    .insert(bookmarks)
    .values({ userId: user.id, type: BookmarkTypes.TEXT, title: "bookmark" })
    .returning();
  for (const [name, attachedBy] of Object.entries(tags)) {
    const [tag] = await db
      .insert(bookmarkTags)
      .values({ name, userId: user.id })
      .returning();
    await db
      .insert(tagsOnBookmarks)
      .values({ bookmarkId: bookmark.id, tagId: tag.id, attachedBy });
  }
  return { userId: user.id, bookmarkId: bookmark.id };
}

async function attachedTags(bookmarkId: string) {
  const rows = await db
    .select({
      name: bookmarkTags.name,
      attachedBy: tagsOnBookmarks.attachedBy,
    })
    .from(tagsOnBookmarks)
    .innerJoin(bookmarkTags, eq(tagsOnBookmarks.tagId, bookmarkTags.id))
    .where(eq(tagsOnBookmarks.bookmarkId, bookmarkId));
  return Object.fromEntries(rows.map((r) => [r.name, r.attachedBy]));
}

describe("connectTags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("replaces the AI tags and keeps the human ones", async () => {
    const { userId, bookmarkId } = await createBookmarkWithTags({
      Linux: "ai",
      reading: "human",
    });

    await connectTags(bookmarkId, ["linux", "docker"], userId);

    // "linux" matches the existing "Linux" tag rather than creating a new one.
    expect(await attachedTags(bookmarkId)).toEqual({
      Linux: "ai",
      docker: "ai",
      reading: "human",
    });
  });

  test("leaves the tags alone for an empty result by default", async () => {
    const { userId, bookmarkId } = await createBookmarkWithTags({
      "off-list": "ai",
      reading: "human",
    });

    await connectTags(bookmarkId, [], userId);

    expect(await attachedTags(bookmarkId)).toEqual({
      "off-list": "ai",
      reading: "human",
    });
    expect(mocks.triggerOnEvent).not.toHaveBeenCalled();
  });

  test("clears the AI tags for an empty result with replaceWhenEmpty", async () => {
    const { userId, bookmarkId } = await createBookmarkWithTags({
      "off-list": "ai",
      reading: "human",
    });

    await connectTags(bookmarkId, [], userId, { replaceWhenEmpty: true });

    expect(await attachedTags(bookmarkId)).toEqual({ reading: "human" });
    expect(mocks.triggerOnEvent).toHaveBeenCalledWith(userId, bookmarkId, [
      { type: "tagRemoved", tagId: expect.any(String) },
    ]);
  });
});
