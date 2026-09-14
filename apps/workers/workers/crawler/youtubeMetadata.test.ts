import { fetchWithProxy } from "network";
import { Response } from "node-fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("network", () => ({
  fetchWithProxy: vi.fn(),
}));

import { fetchYouTubeAuthor } from "./youtubeMetadata";

const runProxy = {
  httpProxy: undefined,
  httpsProxy: undefined,
  noProxy: undefined,
};

describe("fetchYouTubeAuthor", () => {
  beforeEach(() => {
    vi.mocked(fetchWithProxy).mockReset();
  });

  it("gets the video uploader from YouTube oEmbed", async () => {
    vi.mocked(fetchWithProxy).mockResolvedValue(
      new Response(JSON.stringify({ author_name: "Actual uploader" }), {
        status: 200,
      }),
    );

    await expect(
      fetchYouTubeAuthor(
        "https://www.youtube.com/watch?v=video-id",
        AbortSignal.timeout(1_000),
        runProxy,
      ),
    ).resolves.toBe("Actual uploader");
    expect(fetchWithProxy).toHaveBeenCalledWith(
      "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dvideo-id&format=json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      runProxy,
    );
  });

  it("does not request metadata for non-YouTube URLs", async () => {
    await expect(
      fetchYouTubeAuthor(
        "https://example.com/watch?v=video-id",
        AbortSignal.timeout(1_000),
        runProxy,
      ),
    ).resolves.toBeNull();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
});
