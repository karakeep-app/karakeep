import { beforeEach, describe, expect, it, vi } from "vitest";

import { inlineArticleImages, resolveImageUrl } from "./offlineImages";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock:
    vi.fn<
      (
        url: string,
        init: { credentials: string; signal: AbortSignal },
      ) => Promise<Response>
    >(),
}));

vi.mock("expo/fetch", () => ({ fetch: fetchMock }));

const OPTIONS = {
  articleUrl: "https://news.example.org/posts/story.html",
};

function image(bytes = 3, type = "image/png", headers: HeadersInit = {}) {
  return new Response(new Uint8Array(bytes).fill(65), {
    headers: { "content-type": type, ...headers },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("resolveImageUrl", () => {
  const base = "https://news.example.org/posts/2024/story.html?page=2";

  it.each([
    ["pic.png", "https://news.example.org/posts/2024/pic.png"],
    ["../img/pic.png", "https://news.example.org/posts/img/pic.png"],
    ["/img/pic.png?w=2", "https://news.example.org/img/pic.png?w=2"],
    ["//cdn.example.net/a.png", "https://cdn.example.net/a.png"],
    [
      "HTTPS://CDN.example.net:443/a/./b/../c.png",
      "https://cdn.example.net/a/c.png",
    ],
    ["/../../x.png", "https://news.example.org/x.png"],
  ])("resolves %s", (raw, expected) => {
    expect(resolveImageUrl(raw, base)).toBe(expected);
  });

  it.each(["javascript:alert(1)", "blob:abc", "#top", ""])(
    "rejects %s",
    (raw) => {
      expect(resolveImageUrl(raw, base)).toBeUndefined();
    },
  );

  it("needs a base for relative URLs", () => {
    expect(resolveImageUrl("pic.png", undefined)).toBeUndefined();
  });
});

describe("inlineArticleImages", () => {
  it("embeds images and leaves the rest of the markup untouched", async () => {
    fetchMock.mockResolvedValue(image(3));
    const html =
      '<p>Caf&eacute; &amp; more</p><img src="pic.png" srcset="pic-2x.png 2x" sizes="50vw" data-src="lazy.png" alt="A">';

    const result = await inlineArticleImages(html, OPTIONS);

    expect(result).toBe(
      '<p>Caf&eacute; &amp; more</p><img src="data:image/png;base64,QUFB" alt="A" loading="eager">',
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://news.example.org/posts/pic.png",
    );
  });

  it("falls back to data-src and clears <picture> sources", async () => {
    fetchMock.mockResolvedValue(image(3, "image/webp"));
    const result = await inlineArticleImages(
      '<picture><source srcset="big.avif" type="image/avif"><img data-src="small.webp"></picture>',
      OPTIONS,
    );
    expect(result).toBe(
      '<picture><source type="image/avif"><img src="data:image/webp;base64,QUFB" loading="eager"></picture>',
    );
  });

  it("falls back to srcset, the image's own or its <picture>'s", async () => {
    fetchMock.mockImplementation(async () => image());
    const result = await inlineArticleImages(
      '<img srcset="one.png 1x, one-2x.png 2x"><picture><source srcset="two.png"><img></picture>',
      OPTIONS,
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://news.example.org/posts/one.png",
      "https://news.example.org/posts/two.png",
    ]);
    expect(result).toBe(
      '<img src="data:image/png;base64,QUFB" loading="eager"><picture><source><img src="data:image/png;base64,QUFB" loading="eager"></picture>',
    );
  });

  it("keeps commas inside srcset URLs", async () => {
    fetchMock.mockImplementation(async () => image());
    await inlineArticleImages(
      '<img srcset="https://cdn.example.net/resize,w_800/a.jpg 1x, b.jpg 2x"><img srcset="c.jpg, d.jpg 2x">',
      OPTIONS,
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://cdn.example.net/resize,w_800/a.jpg",
      "https://news.example.org/posts/c.jpg",
    ]);
  });

  it("leaves an image that is already embedded alone", async () => {
    const html = '<img src="data:image/gif;base64,R0lG" data-src="photo.png">';
    expect(await inlineArticleImages(html, OPTIONS)).toBe(html);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops downloading once rejected downloads spend the article budget", async () => {
    fetchMock.mockImplementation(async (url) =>
      url.endsWith("ok.png") ? image() : image(6 * 1024 * 1024),
    );
    // With four downloads at a time, at least five of these have been
    // transferred before ok.png would start.
    const html =
      Array.from(
        { length: 8 },
        (_, index) => `<img src="big${index}.png">`,
      ).join("") + '<img src="ok.png">';
    const result = await inlineArticleImages(html, OPTIONS);
    expect(result).toBe(html);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain(
      "https://news.example.org/posts/ok.png",
    );
  });

  it("stops embedding a repeated image before the article gets too big", async () => {
    fetchMock.mockImplementation(async () => image(4 * 1024 * 1024));
    const result = await inlineArticleImages(
      '<img src="a.png">'.repeat(7),
      OPTIONS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.match(/data:image\/png/g)).toHaveLength(5);
    expect(result.match(/src="a.png"/g)).toHaveLength(2);
  });

  it("never sends credentials, even to the server's own assets", async () => {
    fetchMock.mockImplementation(async () => image());
    await inlineArticleImages(
      '<img src="https://keep.example.com/api/assets/%2e%2e/trpc/users.whoami">',
      OPTIONS,
    );
    expect(fetchMock.mock.calls[0][1]).toEqual({
      credentials: "omit",
      signal: expect.any(AbortSignal),
    });
  });

  it("downloads each image once", async () => {
    fetchMock.mockImplementation(async () => image());
    const result = await inlineArticleImages(
      '<img src="a.png"><img src="/posts/a.png">',
      OPTIONS,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.match(/data:image\/png/g)).toHaveLength(2);
  });

  it("keeps the text when images can't be downloaded", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url.endsWith("broken.png")) {
        throw new Error("network");
      }
      if (url.endsWith("page.png")) {
        return new Response("<html>", {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(null, { status: 404 });
    });
    const html =
      '<p>Text</p><img src="broken.png"><img src="page.png"><img src="missing.png">';
    expect(await inlineArticleImages(html, OPTIONS)).toBe(html);
  });

  it("refuses oversized images, declared or not", async () => {
    fetchMock.mockImplementation(async (url) =>
      url.endsWith("declared.png")
        ? image(1, "image/png", { "content-length": String(6 * 1024 * 1024) })
        : image(6 * 1024 * 1024),
    );
    const html = '<img src="declared.png"><img src="streamed.png">';
    expect(await inlineArticleImages(html, OPTIONS)).toBe(html);
    // Nothing keeps downloading once turned down.
    expect(fetchMock.mock.calls.map(([, init]) => init.signal.aborted)).toEqual(
      [true, true],
    );
  });

  it("gives up when the pass is cancelled", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    await expect(
      inlineArticleImages('<img src="a.png">', {
        ...OPTIONS,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("doesn't start when the pass is already cancelled", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      if (init.signal.aborted) {
        throw new Error("aborted");
      }
      return image();
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      inlineArticleImages('<img src="a.png">', {
        ...OPTIONS,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("returns the input as-is when there is nothing to download", async () => {
    const html = '<p>Hi</p><img src="data:image/gif;base64,R0lG">';
    expect(await inlineArticleImages(html, OPTIONS)).toBe(html);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
