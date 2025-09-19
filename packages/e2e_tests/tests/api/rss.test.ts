import { beforeEach, describe, expect, inject, it } from "vitest";

import { BookmarkTypes } from "@karakeep/shared/types/bookmarks";

import { createTestUser } from "../../utils/api";
import { getTrpcClient } from "../../utils/trpc";

describe("RSS Feed API", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  async function fetchRssFeed(listId: string, token: string) {
    return await fetch(
      `http://localhost:${port}/api/v1/rss/lists/${listId}?token=${token}`,
    );
  }

  async function seedDatabase() {
    const trpcClient = getTrpcClient(apiKey);

    // Create two lists
    const manualList = await trpcClient.lists.create.mutate({
      name: "Test List #1",
      icon: "🚀",
      type: "manual",
    });

    const smartList = await trpcClient.lists.create.mutate({
      name: "Test List #2",
      icon: "🚀",
      type: "smart",
      query: "is:fav",
    });

    // Create two bookmarks
    const createBookmark1 = await trpcClient.bookmarks.createBookmark.mutate({
      title: "Test Bookmark #1",
      url: "https://example.com",
      type: BookmarkTypes.LINK,
    });

    const createBookmark2 = await trpcClient.bookmarks.createBookmark.mutate({
      title: "Test Bookmark #2",
      url: "https://example.com/2",
      type: BookmarkTypes.LINK,
      favourited: true,
    });

    await trpcClient.lists.addToList.mutate({
      listId: manualList.id,
      bookmarkId: createBookmark1.id,
    });

    return { manualList, smartList, createBookmark1, createBookmark2 };
  }

  let apiKey: string;

  beforeEach(async () => {
    apiKey = await createTestUser();
  });

  it("should generate rss feed for manual lists", async () => {
    const { manualList } = await seedDatabase();
    const trpcClient = getTrpcClient(apiKey);

    // Enable rss feed
    const token = await trpcClient.lists.regenRssToken.mutate({
      listId: manualList.id,
    });

    const res = await fetchRssFeed(manualList.id, token.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/rss+xml");

    const text = await res.text();
    expect(text).toContain("Test Bookmark #1");
    expect(text).not.toContain("Test Bookmark #2");
  });

  it("should generate rss feed for smart lists", async () => {
    const { smartList } = await seedDatabase();
    const trpcClient = getTrpcClient(apiKey);

    // Enable rss feed
    const token = await trpcClient.lists.regenRssToken.mutate({
      listId: smartList.id,
    });

    const res = await fetchRssFeed(smartList.id, token.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/rss+xml");

    const text = await res.text();
    expect(text).not.toContain("Test Bookmark #1");
    expect(text).toContain("Test Bookmark #2");
  });

  it("should fail when the token is invalid", async () => {
    const { smartList } = await seedDatabase();
    const trpcClient = getTrpcClient(apiKey);

    // Enable rss feed
    const token = await trpcClient.lists.regenRssToken.mutate({
      listId: smartList.id,
    });

    let res = await fetchRssFeed(smartList.id, token.token);
    expect(res.status).toBe(200);

    // Invalidate the token
    await trpcClient.lists.regenRssToken.mutate({
      listId: smartList.id,
    });

    res = await fetchRssFeed(smartList.id, token.token);
    expect(res.status).toBe(404);
  });

  it("should fail when rss gets disabled", async () => {
    const { smartList } = await seedDatabase();
    const trpcClient = getTrpcClient(apiKey);

    // Enable rss feed
    const token = await trpcClient.lists.regenRssToken.mutate({
      listId: smartList.id,
    });

    const res = await fetchRssFeed(smartList.id, token.token);
    expect(res.status).toBe(200);

    // Disable rss feed
    await trpcClient.lists.clearRssToken.mutate({
      listId: smartList.id,
    });

    const res2 = await fetchRssFeed(smartList.id, token.token);
    expect(res2.status).toBe(404);
  });

  it("should fail when no token is provided", async () => {
    const { smartList } = await seedDatabase();
    const trpcClient = getTrpcClient(apiKey);

    // Enable rss feed
    await trpcClient.lists.regenRssToken.mutate({
      listId: smartList.id,
    });

    const res2 = await fetchRssFeed(smartList.id, "");
    expect(res2.status).toBe(400);
  });
});
