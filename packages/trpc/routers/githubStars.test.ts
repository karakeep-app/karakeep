import { ManualList } from "../models/lists";
import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { githubStarsSubscriptions } from "@karakeep/db/schema";
import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";
import { defaultBeforeEach } from "../testUtils";
import type { CustomTestContext } from "../testUtils";
import {
  GithubStarsError,
  syncGithubStarsPage,
} from "../models/githubStars.service";

beforeEach<CustomTestContext>(defaultBeforeEach(true));

async function setup({ apiCallers }: CustomTestContext) {
  const api = apiCallers[0];
  const list = await api.lists.create({
    name: "GitHub",
    icon: "⭐",
    type: "manual",
  });
  const subscription = await api.githubStars.save({
    username: "octocat",
    listId: list.id,
    enabled: true,
    importTopics: true,
  });
  return { api, list, subscription };
}

test<CustomTestContext>("sync preserves existing bookmarks and resumes pages without duplicates", async (ctx) => {
  const { api, list, subscription } = await setup(ctx);
  const existing = await api.bookmarks.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://github.com/example/one",
    note: "Keep my note",
    archived: true,
    favourited: true,
  });
  await api.bookmarks.updateTags({
    bookmarkId: existing.id,
    attach: [{ tagName: "mine" }],
    detach: [],
  });
  const page = {
    repositories: [{ full_name: "example/one", topics: ["typescript"] }],
    hasNext: true,
  };
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => page,
    async () => api,
  );
  const saved = await api.bookmarks.getBookmark({ bookmarkId: existing.id });
  expect(saved.note).toBe("Keep my note");
  expect(saved.archived).toBe(true);
  expect(saved.favourited).toBe(true);
  expect(saved.tags.map((tag) => tag.name)).toEqual(
    expect.arrayContaining(["mine", "typescript"]),
  );
  expect(
    (await api.lists.getListsOfBookmark({ bookmarkId: existing.id })).lists.map(
      (l) => l.id,
    ),
  ).toContain(list.id);
  expect((await api.githubStars.get())?.nextPage).toBe(2);
  expect((await api.githubStars.get())?.lastSuccessfulSyncAt).toBeNull();
  ctx.db
    .update(githubStarsSubscriptions)
    .set({ nextRunAt: new Date(0) })
    .where(eq(githubStarsSubscriptions.id, subscription.id))
    .run();
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async (_, pageNumber) => {
      expect(pageNumber).toBe(2);
      return { ...page, hasNext: false };
    },
    async () => api,
  );
  expect((await api.githubStars.get())?.nextPage).toBe(1);
  expect((await api.githubStars.get())?.lastSuccessfulSyncAt).not.toBeNull();
  expect((await api.bookmarks.getBookmarks({})).bookmarks).toHaveLength(1);
});

test<CustomTestContext>("rate limits preserve progress and cannot be bypassed by syncNow", async (ctx) => {
  const { api, subscription } = await setup(ctx);
  const retryAt = new Date(Date.now() + 3600_000);
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => {
      throw new GithubStarsError("GitHub rate limit reached.", retryAt, true);
    },
    async () => api,
  );
  expect((await api.githubStars.get())?.lastError).toBe(
    "GitHub rate limit reached.",
  );
  expect((await api.githubStars.get())?.nextPage).toBe(1);
  await expect(api.githubStars.syncNow()).rejects.toMatchObject({
    code: "TOO_MANY_REQUESTS",
  });
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => {
      throw new Error("must not fetch during cooldown");
    },
    async () => api,
  );
  expect((await api.githubStars.get())?.lastError).toBe(
    "GitHub rate limit reached.",
  );
});

test<CustomTestContext>("other users cannot use your destination or read your configuration", async (ctx) => {
  const { list } = await setup(ctx);
  expect(await ctx.apiCallers[1].githubStars.get()).toBeNull();
  await expect(
    ctx.apiCallers[1].githubStars.save({
      username: "octocat",
      listId: list.id,
      enabled: true,
      importTopics: false,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(ctx.unauthedAPICaller.githubStars.get()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});

test<CustomTestContext>("disconnect cancels stale jobs and never deletes imported bookmarks", async (ctx) => {
  const { api, subscription } = await setup(ctx);
  const bookmark = await api.bookmarks.createBookmark({
    type: BookmarkTypes.LINK,
    url: "https://github.com/example/keep",
  });
  await api.githubStars.disconnect();
  const read = vi.fn(async () => {
    throw new Error("Disconnected jobs must not fetch");
  });
  await syncGithubStarsPage(ctx.db, subscription.id, read, async () => api);
  expect(read).not.toHaveBeenCalled();
  expect(await api.githubStars.get()).toBeNull();
  expect(
    (await api.bookmarks.getBookmarks({})).bookmarks.map((b) => b.id),
  ).toEqual([bookmark.id]);
});

test<CustomTestContext>("overlapping jobs claim only one lease", async (ctx) => {
  const { api, subscription } = await setup(ctx);
  let fetches = 0;
  const readPage = async () => {
    fetches++;
    return { repositories: [], hasNext: false };
  };
  await Promise.all([
    syncGithubStarsPage(ctx.db, subscription.id, readPage, async () => api),
    syncGithubStarsPage(ctx.db, subscription.id, readPage, async () => api),
  ]);
  expect(fetches).toBe(1);
});

test<CustomTestContext>("a partially imported page retries without duplicating bookmarks", async (ctx) => {
  const { api, subscription } = await setup(ctx);
  const original = ManualList.prototype.addBookmark;
  // Fail the second list attachment, after its bookmark has been created.
  const failing = vi
    .spyOn(ManualList.prototype, "addBookmark")
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error("temporary storage failure"));
  const page = {
    repositories: [
      { full_name: "example/one", topics: [] },
      { full_name: "example/two", topics: [] },
    ],
    hasNext: false,
  };
  try {
    await syncGithubStarsPage(
      ctx.db,
      subscription.id,
      async () => page,
      async () => api,
    );
  } finally {
    failing.mockRestore();
  }
  expect((await api.githubStars.get())?.lastError).not.toBeNull();
  expect((await api.githubStars.get())?.lastSuccessfulSyncAt).toBeNull();
  ctx.db
    .update(githubStarsSubscriptions)
    .set({ nextRunAt: new Date(0) })
    .where(eq(githubStarsSubscriptions.id, subscription.id))
    .run();
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => page,
    async () => api,
  );
  expect((await api.bookmarks.getBookmarks({})).bookmarks).toHaveLength(2);
  expect((await api.githubStars.get())?.lastError).toBeNull();
});

test<CustomTestContext>("paused and replaced configurations do not import", async (ctx) => {
  const { api, list, subscription } = await setup(ctx);
  await api.githubStars.save({
    username: "octocat",
    listId: list.id,
    enabled: false,
    importTopics: false,
  });
  const read = vi.fn(async () => ({ repositories: [], hasNext: false }));
  await syncGithubStarsPage(ctx.db, subscription.id, read, async () => api);
  const paused = await api.githubStars.get();
  await syncGithubStarsPage(ctx.db, paused!.id, read, async () => api);
  expect(read).not.toHaveBeenCalled();
  await expect(api.githubStars.syncNow()).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
});

test<CustomTestContext>("rejects unsafe usernames and smart lists", async (ctx) => {
  const { api, list } = await setup(ctx);
  for (const username of ["../other", "a/b", "-invalid", "x".repeat(40)]) {
    await expect(
      api.githubStars.save({
        username,
        listId: list.id,
        enabled: true,
        importTopics: false,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  const smart = await api.lists.create({
    name: "Smart",
    icon: "⭐",
    type: "smart",
    query: "is:fav",
  });
  await expect(
    api.githubStars.save({
      username: "octocat",
      listId: smart.id,
      enabled: true,
      importTopics: false,
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test<CustomTestContext>("settings and disconnect wait for the active batch", async (ctx) => {
  const { api, list, subscription } = await setup(ctx);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const run = syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => {
      await gate;
      return { repositories: [], hasNext: false };
    },
    async () => api,
  );
  try {
    await expect(api.githubStars.disconnect()).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      api.githubStars.save({
        username: "other",
        listId: list.id,
        enabled: true,
        importTopics: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await api.githubStars.get())?.id).toBe(subscription.id);
  } finally {
    finish();
    await run;
  }
  await api.githubStars.disconnect();
  expect(await api.githubStars.get()).toBeNull();
});

test<CustomTestContext>("local failures allow immediate manual retry", async (ctx) => {
  const { api, subscription } = await setup(ctx);
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => {
      throw new Error("transient local failure");
    },
    async () => api,
  );
  expect((await api.githubStars.get())?.lastError).not.toBeNull();
  expect((await api.githubStars.get())?.rateLimitUntil).toBeNull();
  await api.githubStars.syncNow();
  let fetched = false;
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => {
      fetched = true;
      return { repositories: [], hasNext: false };
    },
    async () => api,
  );
  expect(fetched).toBe(true);
});

test<CustomTestContext>("one-time imports finish all pages then stop until explicitly restarted", async (ctx) => {
  const { api, list } = await setup(ctx);
  const subscription = await api.githubStars.save({
    username: "octocat",
    listId: list.id,
    enabled: true,
    recurring: false,
    importTopics: false,
  });
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => ({ repositories: [], hasNext: true }),
    async () => api,
  );
  expect(await api.githubStars.get()).toMatchObject({
    enabled: true,
    nextPage: 2,
  });
  await api.githubStars.syncNow();
  await syncGithubStarsPage(
    ctx.db,
    subscription.id,
    async () => ({ repositories: [], hasNext: false }),
    async () => api,
  );
  expect(await api.githubStars.get()).toMatchObject({
    enabled: false,
    nextPage: 1,
    lastSuccessfulSyncAt: expect.any(Date),
  });
  const read = vi.fn(async () => ({ repositories: [], hasNext: false }));
  await syncGithubStarsPage(ctx.db, subscription.id, read, async () => api);
  expect(read).not.toHaveBeenCalled();
});
