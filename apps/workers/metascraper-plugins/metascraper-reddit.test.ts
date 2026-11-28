import metascraper from "metascraper";
import { beforeEach, describe, expect, test, vi } from "vitest";

const fetchWithProxyMock = vi.fn();

vi.mock("../network", () => ({
  fetchWithProxy: (...args: unknown[]) => fetchWithProxyMock(...args),
}));

import metascraperReddit from "./metascraper-reddit";

describe("metascraperReddit", () => {
  const parser = metascraper([metascraperReddit()]);

  beforeEach(() => {
    fetchWithProxyMock.mockReset();
  });

  test("skips Reddit JSON API fetches for non-post URLs (home, subreddit, profile, login)", async () => {
    const nonPostUrls = [
      "https://www.reddit.com/",
      "https://www.reddit.com/r/programming/",
      "https://www.reddit.com/user/example/",
      "https://old.reddit.com/login?dest=https%3A%2F%2Fold.reddit.com%2Fr%2Fexample%2Fcomments%2Fabc123%2F",
    ];

    for (const url of nonPostUrls) {
      await parser({
        url,
        html: "<html><head><title>Reddit</title></head><body></body></html>",
        validateUrl: false,
      });
    }

    expect(fetchWithProxyMock).not.toHaveBeenCalled();
  });

  test("fetches Reddit JSON API for post, share-link, and gallery URLs", async () => {
    fetchWithProxyMock.mockResolvedValue({
      status: 403,
      ok: false,
    });

    const postUrls = [
      [
        "https://www.reddit.com/r/selfhosted/comments/abc123/my_post/",
        "https://www.reddit.com/r/selfhosted/comments/abc123/my_post.json",
      ],
      [
        "https://www.reddit.com/r/selfhosted/s/XyZ987",
        "https://www.reddit.com/r/selfhosted/s/XyZ987.json",
      ],
      [
        "https://www.reddit.com/gallery/abc123",
        "https://www.reddit.com/gallery/abc123.json",
      ],
    ] as const;

    for (const [url, expectedJsonUrl] of postUrls) {
      fetchWithProxyMock.mockClear();
      await parser({
        url,
        html: '<html><body><shreddit-title title="My Post"></shreddit-title></body></html>',
        validateUrl: false,
      });

      expect(fetchWithProxyMock).toHaveBeenCalledTimes(1);
      expect(fetchWithProxyMock).toHaveBeenCalledWith(
        expectedJsonUrl,
        expect.objectContaining({ headers: { accept: "application/json" } }),
      );
    }
  });
});
