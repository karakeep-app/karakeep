import { assert, beforeEach, describe, expect, inject, it } from "vitest";

import { createTestUser } from "../../utils/api";
import { waitUntil } from "../../utils/general";
import { getTrpcClient } from "../../utils/trpc";

describe("Feed Worker Tests", () => {
  const port = inject("karakeepPort");

  if (!port) {
    throw new Error("Missing required environment variables");
  }

  let apiKey: string;

  beforeEach(async () => {
    apiKey = await createTestUser();
  });

  it("should fetch and parse an RSS feed and create bookmarks", async () => {
    const trpcClient = getTrpcClient(apiKey);

    // Create a feed pointing to the RSS file served by nginx
    const feed = await trpcClient.feeds.create.mutate({
      name: "Test Feed",
      url: "http://nginx:80/feed.xml",
      enabled: true,
    });

    expect(feed.id).toBeDefined();
    expect(feed.lastFetchedStatus).toBe("pending");
    expect(feed.lastSuccessfulFetchAt).toBeNull();

    // Trigger a manual fetch
    await trpcClient.feeds.fetchNow.mutate({ feedId: feed.id });

    // Wait until the feed has been fetched successfully
    await waitUntil(async () => {
      const updated = await trpcClient.feeds.get.query({ feedId: feed.id });
      return updated.lastFetchedStatus === "success";
    }, "Feed is fetched successfully");

    // Verify the feed status
    const fetchedFeed = await trpcClient.feeds.get.query({ feedId: feed.id });
    expect(fetchedFeed.lastFetchedStatus).toBe("success");
    expect(fetchedFeed.lastFetchedAt).toBeDefined();
    expect(fetchedFeed.lastSuccessfulFetchAt).toBeDefined();

    // Verify bookmarks were created from the feed entries
    const bookmarks = await trpcClient.bookmarks.getBookmarks.query({
      archived: false,
    });

    expect(bookmarks.bookmarks.length).toBe(2);

    const titles = bookmarks.bookmarks.map((b) => b.title);
    expect(titles).toContain("First Test Article");
    expect(titles).toContain("Second Test Article");

    const urls = bookmarks.bookmarks.map((b) => {
      assert(b.content.type === "link");
      return b.content.url;
    });
    expect(urls).toContain("http://nginx:80/hello.html");
    expect(urls).toContain("http://nginx:80/hello.html?article=2");
  });

  it("should import tags from RSS categories when importTags is enabled", async () => {
    const trpcClient = getTrpcClient(apiKey);

    // Create a feed with importTags enabled
    const feed = await trpcClient.feeds.create.mutate({
      name: "Test Feed With Tags",
      url: "http://nginx:80/feed.xml",
      enabled: true,
      importTags: true,
    });

    // Trigger a manual fetch
    await trpcClient.feeds.fetchNow.mutate({ feedId: feed.id });

    // Wait until the feed has been fetched successfully
    await waitUntil(async () => {
      const updated = await trpcClient.feeds.get.query({ feedId: feed.id });
      return updated.lastFetchedStatus === "success";
    }, "Feed with tags is fetched successfully");

    // Verify bookmarks were created
    const bookmarks = await trpcClient.bookmarks.getBookmarks.query({
      archived: false,
    });
    expect(bookmarks.bookmarks.length).toBe(2);

    // Find the first article and check its tags
    const firstArticle = bookmarks.bookmarks.find(
      (b) => b.title === "First Test Article",
    );
    assert(firstArticle);
    const firstTags = firstArticle.tags.map((t) => t.name);
    expect(firstTags).toContain("tech");
    expect(firstTags).toContain("testing");

    // Find the second article and check its tags
    const secondArticle = bookmarks.bookmarks.find(
      (b) => b.title === "Second Test Article",
    );
    assert(secondArticle);
    const secondTags = secondArticle.tags.map((t) => t.name);
    expect(secondTags).toContain("news");
  });

  it("should not create duplicate bookmarks on re-fetch", async () => {
    const trpcClient = getTrpcClient(apiKey);

    const feed = await trpcClient.feeds.create.mutate({
      name: "Test Feed Dedup",
      url: "http://nginx:80/feed.xml",
      enabled: true,
    });

    // First fetch
    await trpcClient.feeds.fetchNow.mutate({ feedId: feed.id });
    await waitUntil(async () => {
      const updated = await trpcClient.feeds.get.query({ feedId: feed.id });
      return updated.lastFetchedStatus === "success";
    }, "First feed fetch completes");

    const afterFirstFetch = await trpcClient.feeds.get.query({
      feedId: feed.id,
    });
    assert(afterFirstFetch.lastSuccessfulFetchAt);
    const firstSuccessfulFetchAt = afterFirstFetch.lastSuccessfulFetchAt;

    const firstFetch = await trpcClient.bookmarks.getBookmarks.query({
      archived: false,
    });
    expect(firstFetch.bookmarks.length).toBe(2);

    // Second fetch of the same feed - should not create duplicates
    await trpcClient.feeds.fetchNow.mutate({ feedId: feed.id });
    await waitUntil(async () => {
      const updated = await trpcClient.feeds.get.query({ feedId: feed.id });
      assert(updated.lastSuccessfulFetchAt);
      return updated.lastSuccessfulFetchAt > firstSuccessfulFetchAt;
    }, "Second feed fetch completes");

    const secondFetch = await trpcClient.bookmarks.getBookmarks.query({
      archived: false,
    });
    expect(secondFetch.bookmarks.length).toBe(2);
  });

  it("should preserve the last successful fetch after a failed fetch", async () => {
    const trpcClient = getTrpcClient(apiKey);

    const feed = await trpcClient.feeds.create.mutate({
      name: "Test Feed Failure Tracking",
      url: "http://nginx:80/feed.xml",
      enabled: true,
    });

    await trpcClient.feeds.fetchNow.mutate({ feedId: feed.id });
    await waitUntil(async () => {
      const updated = await trpcClient.feeds.get.query({ feedId: feed.id });
      return updated.lastFetchedStatus === "success";
    }, "Initial successful feed fetch completes");

    const afterSuccess = await trpcClient.feeds.get.query({ feedId: feed.id });
    assert(afterSuccess.lastSuccessfulFetchAt);
    const firstSuccessfulFetchAt = afterSuccess.lastSuccessfulFetchAt;

    await trpcClient.feeds.update.mutate({
      feedId: feed.id,
      url: "http://nginx:80/hello.html",
    });

    await trpcClient.feeds.fetchNow.mutate({ feedId: feed.id });
    await waitUntil(async () => {
      const updated = await trpcClient.feeds.get.query({ feedId: feed.id });
      return updated.lastFetchedStatus === "failure";
    }, "Failed feed fetch completes");

    const afterFailure = await trpcClient.feeds.get.query({ feedId: feed.id });
    assert(afterFailure.lastFetchedAt);
    assert(afterFailure.lastSuccessfulFetchAt);

    expect(afterFailure.lastFetchedStatus).toBe("failure");
    expect(afterFailure.lastSuccessfulFetchAt.toISOString()).toBe(
      firstSuccessfulFetchAt.toISOString(),
    );
    expect(
      afterFailure.lastFetchedAt > afterFailure.lastSuccessfulFetchAt,
    ).toBe(true);
  });
});
